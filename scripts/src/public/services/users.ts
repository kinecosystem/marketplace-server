import { Brackets } from "typeorm";

import * as metrics from "../../metrics";
import { Order } from "../../models/orders";
import { isNothing, normalizeError, readUTCDate } from "../../utils/utils";
import { Application } from "../../models/applications";
import { getDefaultLogger as logger } from "../../logging";
import { User, AuthToken as DbAuthToken, WalletApplication } from "../../models/users";
import { MaxWalletsExceeded, NoSuchUser, NoSuchApp, CrossAppWallet } from "../../errors";
import { create as createUserRegistrationFailed } from "../../analytics/events/user_registration_failed";
import { create as createUserLoginServerRequested } from "../../analytics/events/user_login_server_requested";
import { create as createUserLoginServerSucceeded } from "../../analytics/events/user_login_server_succeeded";
import { create as createUserRegistrationRequested } from "../../analytics/events/user_registration_requested";
import { create as createUserRegistrationSucceeded } from "../../analytics/events/user_registration_succeeded";
import { create as createUserLogoutServerRequested } from "../../analytics/events/user_logout_server_requested";
import { create as createWalletAddressUpdateSucceeded } from "../../analytics/events/wallet_address_update_succeeded";
import { create as createRestoreRequestFailed } from "../../analytics/events/restore_request_failed";

import * as payment from "./payment";
import { assertRateLimitRegistration } from "../../utils/rate_limit";
import { setHttpContext } from "../auth";
import { getRedisClient } from "../../redis";
import { BlockchainVersion } from "../../models/offers";

const notExistsTTL = 15 * 60; // cache the fact that a user doesn't exist for 15 minutes
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

export async function isRestoreAllowed(walletAddress: string, appId: string, addOnNonExisting: boolean = true): Promise<boolean> {
	const appWallet = await WalletApplication.get(walletAddress);
	if (appWallet) {
		logger().info(`Wallet ${ walletAddress } is associated with app ${ appWallet.appId }, current app is ${ appId }`);
		if (appWallet.appId !== appId) {
			return false;
		}
	} else if (addOnNonExisting) {
		logger().info(`Wallet ${ walletAddress } does not exist in wallet_application table, add`);
		try {
			const newWallet = WalletApplication.create({ walletAddress, appId });
			await newWallet.save();
		} catch (e) {
			// might catch a "violates unique constraint" error, check by finding the wallet again
			if (!await WalletApplication.get(walletAddress)) {
				throw e;
			}
		}
	}
	return true;
}

async function createWallet(walletAddress: string, user: User, app: Application) {
	let blockchainVersion: BlockchainVersion;

	if (app.config.blockchain_version === "3" || app.shouldApplyGradualMigration(user.createdDate)) {
		// when gradual migration is on, I don't need to create a KIN2 account
		await WalletApplication.updateCreatedDate(walletAddress, "3");
		await payment.createWallet(walletAddress, user.appId, user.id, "3");
		blockchainVersion = "3";
	} else { // kin2
		await WalletApplication.updateCreatedDate(walletAddress, "2");
		await Promise.all([
			payment.createWallet(walletAddress, user.appId, user.id, "2"),
			// optimization: create wallets on kin3 to reduce time when migrating
			payment.createWallet(walletAddress, user.appId, user.id, "3"),
		]);
		blockchainVersion = "2";

	}
	logger().info(`creating wallet for user ${ user.appId }: ${ walletAddress } on KIN${ blockchainVersion }`);
}

export async function updateUser(user: User, props: UpdateUserProps) {
	if (props.walletAddress) {
		const wallets = await user.getWallets();
		const appId = user.appId;
		const app = await Application.get(appId);
		const totalWalletCount = wallets.count + user.walletCount;
		const walletAddress = props.walletAddress;

		/*  Start of Cross-app restore check (when removing, remove test too) */
		if (!await isRestoreAllowed(walletAddress, appId)) {
			createRestoreRequestFailed(user.id, props.deviceId, "blocking cross-app restore request").report();
			throw CrossAppWallet(walletAddress, appId);
		}
		/*  End of Cross-app restore check */

		if (!app) {
			throw NoSuchApp(appId);
		}

		if (!wallets.has(walletAddress) && !app.allowsNewWallet(totalWalletCount)) {
			metrics.maxWalletsExceeded(appId);
			throw MaxWalletsExceeded();
		}

		const isNewWallet = await user.updateWallet(props.deviceId, walletAddress);
		if (isNewWallet) {
			await createWallet(walletAddress, user, app);
		}
		metrics.walletAddressUpdate(appId, isNewWallet);

		createWalletAddressUpdateSucceeded(user.id, props.deviceId).report();
	}
}

export async function activateUser(authToken: DbAuthToken, user: User): Promise<AuthToken> {
	// no activation needed anymore
	return AuthTokenDbToApi(authToken, user);
}

export async function userExists(appId: string, appUserId: string): Promise<boolean> {
	if (isNothing(appUserId) || appUserId === "") {
		return false; // Some apps are sending empty appUserIds
	}
	// get from cache
	const redis = getRedisClient();
	const key = `app:${ appId }:user:${ appUserId }:exists`;
	const value = await redis.async.get(key);
	if (value) {
		return JSON.parse(value);
	}
	// get from DB

	const user = await User.findOne({ appId, appUserId });
	// cache
	if (user !== undefined) {
		await redis.async.set(key, "true");
	} else {
		await redis.async.setex(key, notExistsTTL, "false");
	}

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
	createUserLogoutServerRequested(user.id, token.deviceId).report();
	await token.save();
}

export async function register(
	app: Application,
	appUserId: string,
	appId: string,
	deviceId: string) {

	let user = await User.findOne({ appId, appUserId });
	if (!user) {
		createUserRegistrationRequested(null as any, deviceId).report();
		await assertRateLimitRegistration(app);
		try {
			logger().info("creating a new user", { appId, appUserId });
			user = User.new({ appUserId, appId, isNew: true });
			await user.save();
			metrics.userRegister(true, appId);
			createUserRegistrationSucceeded(user.id, deviceId).report();
		} catch (e) {
			// might catch a "violates unique constraint" error, check by finding the user again
			user = await User.findOne({ appId, appUserId });
			if (user) {
				logger().warn("solved user registration race condition");
				metrics.userRegister(false, appId);
			} else {
				createUserRegistrationFailed(null as any, deviceId, normalizeError(e)).report();
				throw e; // some other error
			}
		}
	} else {
		metrics.userRegister(false, appId);
	}

	createUserLoginServerRequested(user.id, deviceId).report();
	createUserLoginServerSucceeded(user.id, deviceId).report();
	const authToken = await (DbAuthToken.new({ userId: user.id, deviceId }).save());
	setHttpContext(authToken, user);

	return {
		user,
		token: authToken,
		profile: await createUserProfileObject(user, deviceId)
	};
}

async function createUserProfileObject(user: User, deviceId: string): Promise<UserProfile> {
	const data: Array<{ type: string; last_date: string; cnt: number; }> = await Order.queryBuilder("ordr_createUserProfileObject")
		.select("context.type", "type")
		.addSelect("MAX(ordr_createUserProfileObject.createdDate)", "last_date")
		.addSelect("COUNT(*)", "cnt")
		.leftJoin("ordr_createUserProfileObject.contexts", "context")
		.where("context.userId = :userId", { userId: user.id })
		.andWhere(new Brackets(qb => {
			qb.where("ordr_createUserProfileObject.status = :status", { status: "completed" })
				.orWhere(
					new Brackets(qb2 => {
						qb2.where("ordr_createUserProfileObject.status IN (:statuses)", { statuses: ["pending", "opened"] })
							.andWhere("ordr_createUserProfileObject.expirationDate > :date", { date: new Date() });
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

	const wallet = (await user.getWallets(deviceId)).lastUsed() || (await user.getWallets()).lastUsed();

	return {
		stats,
		created_date: user.createdDate.toISOString(),
		current_wallet: wallet ? wallet.address : null
	};
}
