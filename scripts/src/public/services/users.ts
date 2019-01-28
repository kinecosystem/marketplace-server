import * as moment from "moment";
import { Brackets } from "typeorm";

import * as metrics from "../../metrics";
import { Order } from "../../models/orders";
import { normalizeError, readUTCDate } from "../../utils/utils";
import { Application } from "../../models/applications";
import { getDefaultLogger as logger } from "../../logging";
import { User, AuthToken as DbAuthToken } from "../../models/users";
import { MaxWalletsExceeded, NoSuchUser, NoSuchApp } from "../../errors";
import { create as createUserRegistrationFailed } from "../../analytics/events/user_registration_failed";
import { create as createUserLoginServerRequested } from "../../analytics/events/user_login_server_requested";
import { create as createUserLoginServerSucceeded } from "../../analytics/events/user_login_server_succeeded";
import { create as createUserRegistrationRequested } from "../../analytics/events/user_registration_requested";
import { create as createUserRegistrationSucceeded } from "../../analytics/events/user_registration_succeeded";
import { create as createUserLogoutServerRequested } from "../../analytics/events/user_logout_server_requested";
import { create as createWalletAddressUpdateSucceeded } from "../../analytics/events/wallet_address_update_succeeded";

import * as payment from "./payment";
import { assertRateLimitRegistration } from "../../utils/rate_limit";

export type V1AuthToken = {
	token: string;
	activated: boolean;
	expiration_date: string;
	app_id: string;
	user_id: string;
	ecosystem_user_id: string;
};

function V1AuthTokenDbToApi(authToken: DbAuthToken, user: User): V1AuthToken {
	return {
		token: authToken.id,
		activated: true, // always true - activation not needed
		app_id: user.appId,
		user_id: user.appUserId,
		ecosystem_user_id: user.id,
		expiration_date: authToken.expireDate.toISOString()
	};
}

export async function v1GetOrCreateUserCredentials(
	app: Application,
	appUserId: string,
	walletAddress: string,
	deviceId: string): Promise<V1AuthToken> {

	const data = await register(app, appUserId, app.id, deviceId);
	await updateUser(data.user, { walletAddress, deviceId });

	return V1AuthTokenDbToApi(data.token, data.user);
}

export type AuthToken = {
	token: string;
	app_id: string;
	user_id: string;
	activated: boolean;
	expiration_date: string;
	ecosystem_user_id: string;
};

function AuthTokenDbToApi(authToken: DbAuthToken, user: User): AuthToken {
	return {
		activated: true, // always true - activation not needed
		app_id: user.appId,
		token: authToken.id,
		user_id: user.appUserId,
		ecosystem_user_id: user.id,
		expiration_date: authToken.expireDate.toISOString()
	};
}

export async function getOrCreateUserCredentials(
	app: Application,
	appUserId: string,
	deviceId: string): Promise<{ auth: AuthToken, user: UserProfile; }> {

	const data = await register(app, appUserId, app.id, deviceId);

	return {
		user: data.profile,
		auth: AuthTokenDbToApi(data.token, data.user)
	};
}

export type UpdateUserProps = {
	deviceId: string;
	walletAddress: string;
};

export async function updateUser(user: User, props: UpdateUserProps) {
	if (props.walletAddress) {
		const wallets = await user.getWallets();
		const app = await Application.get(user.appId);

		if (!app) {
			throw NoSuchApp(user.appId);
		}

		if (!app.allowsNewWallet(wallets.count + user.walletCount)) {
			metrics.maxWalletsExceeded(app.id);
			throw MaxWalletsExceeded();
		}

		const isNew = await user.updateWallet(props.deviceId, props.walletAddress);
		if (isNew) {
			logger().info(`creating stellar wallet for user ${ user.id }: ${ props.walletAddress }`);
			await payment.createWallet(props.walletAddress, user.appId, user.id);
		}

		createWalletAddressUpdateSucceeded(user.id, props.deviceId).report();
	}
}

export async function activateUser(authToken: DbAuthToken, user: User): Promise<AuthToken> {
	// no activation needed anymore
	return AuthTokenDbToApi(authToken, user);
}

export async function userExists(appId: string, appUserId: string): Promise<boolean> {
	const user = await User.findOne({ appId, appUserId });
	logger().debug(`userExists service appId: ${ appId }, appUserId: ${ appUserId }, user: `, user);
	return user !== undefined;
}

export type UserStats = {
	earn_count: number;
	spend_count: number;
	last_earn_date?: string;
	last_spend_date?: string;
};

export type V1UserProfile = {
	stats: UserStats
};

export type UserProfile = {
	stats: UserStats
	created_date: string;
	current_wallet: string | null;
};

export async function getUserProfile(userId: string, deviceId: string): Promise<UserProfile> {
	const user = await User.findOneById(userId);
	if (!user) {
		throw NoSuchUser(userId);
	}

	return createUserProfileObject(user, deviceId);
}

export async function logout(user: User, token: DbAuthToken) {
	token.valid = false;
	createUserLogoutServerRequested(user.id, token.deviceId);
	await token.save();
}

async function register(
	app: Application,
	appUserId: string,
	appId: string,
	deviceId: string) {

	let user = await User.findOne({ appId, appUserId });
	if (!user) {
		await assertRateLimitRegistration(app);
		try {
			logger().info("creating a new user", { appId, appUserId });
			user = User.new({ appUserId, appId });
			await user.save();
			metrics.userRegister(true, appId);
			createUserRegistrationRequested(null as any, deviceId).report();
			createUserRegistrationSucceeded(user.id, deviceId).report();
		} catch (e) {
			// maybe caught a "violates unique constraint" error, check by finding the user again
			user = await User.findOne({ appId, appUserId });
			if (user) {
				logger().warn("solved user registration race condition");
				metrics.userRegister(false, appId);
			} else {
				createUserRegistrationRequested(null as any, deviceId).report();
				createUserRegistrationFailed(null as any, deviceId, normalizeError(e)).report();
				throw e; // some other error
			}
		}
	} else {
		metrics.userRegister(false, appId);
	}

	// XXX should be a scope object
	let authToken = await DbAuthToken.findOne({
		where: { deviceId, userId: user.id, valid: true },
		order: { createdDate: "DESC" }
	});
	if (!authToken || authToken.isAboutToExpire()) {
		createUserLoginServerRequested(user.id, deviceId).report();
		createUserLoginServerSucceeded(user.id, deviceId).report();
		authToken = await (DbAuthToken.new({ userId: user.id, deviceId }).save());
	}

	return {
		user,
		token: authToken,
		profile: await createUserProfileObject(user, deviceId)
	};
}

async function createUserProfileObject(user: User, deviceId: string): Promise<UserProfile> {
	const data: Array<{ type: string; last_date: string; cnt: number; }> = await Order.queryBuilder("ordr")
		.select("context.type", "type")
		.addSelect("MAX(ordr.createdDate)", "last_date")
		.addSelect("COUNT(*)", "cnt")
		.leftJoin("ordr.contexts", "context")
		.where("context.userId = :userId", { userId: user.id })
		.andWhere(new Brackets(qb => {
			qb.where("ordr.status = :status", { status: "completed" })
				.orWhere(
					new Brackets(qb2 => {
						qb2.where("ordr.status IN (:statuses)", { statuses: ["pending", "opened"] })
							.andWhere("ordr.expirationDate > :date", { date: new Date() });
					})
				);
		}))
		.groupBy("context.type")
		.getRawMany();

	const stats: UserStats = {
		earn_count: 0,
		spend_count: 0
	};

	for (const row of data) {
		if (row.type === "earn") {
			stats.earn_count = Number(row.cnt);
			stats.last_earn_date = readUTCDate(row.last_date).toISOString();
		} else if (row.type === "spend") {
			stats.spend_count = Number(row.cnt);
			stats.last_spend_date = readUTCDate(row.last_date).toISOString();
		}
	}

	const wallet = (await user.getWallets(deviceId)).lastUsed();

	return {
		stats,
		created_date: user.createdDate.toISOString(),
		current_wallet: wallet ? wallet.address : null
	};
}
