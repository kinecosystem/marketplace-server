import * as moment from "moment";
import { Brackets } from "typeorm";

import * as metrics from "../../metrics";
import { Order } from "../../models/orders";
import { readUTCDate } from "../../utils/utils";
import { MaxWalletsExceeded } from "../../errors";
import { Application } from "../../models/applications";
import { getDefaultLogger as logger } from "../../logging";
import { User, AuthToken as DbAuthToken } from "../../models/users";
import { create as createWalletAddressUpdateSucceeded } from "../../analytics/events/wallet_address_update_succeeded";

import * as payment from "./payment";
import { assertRateLimitRegistration } from "../../utils/rate_limit";

export type AuthToken = {
	token: string;
	app_id: string;
	user_id: string;
	activated: boolean;
	expiration_date: string;
	ecosystem_user_id: string;
	type: "new" | "returning";
};

function AuthTokenDbToApi(authToken: DbAuthToken, user: User, newUser: boolean): AuthToken {
	const type = newUser ? "new" : "returning";

	return {
		type,
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
	appId: string,
	deviceId: string): Promise<AuthToken> {

	let newUser = false;
	let user = await User.findOne({ appId, appUserId });
	if (!user) {
		newUser = true;
		await assertRateLimitRegistration(app.id, app.config.limits.hourly_registration, moment.duration({ hours: 1 }));
		await assertRateLimitRegistration(app.id, app.config.limits.minute_registration, moment.duration({ minutes: 1 }));

		try {
			logger().info("creating a new user", { appId, appUserId });
			user = User.new({ appUserId, appId });
			await user.save();
			metrics.userRegister(true, appId);
		} catch (e) {
			// maybe caught a "violates unique constraint" error, check by finding the user again
			user = await User.findOne({ appId, appUserId });
			if (user) {
				logger().warn("solved user registration race condition");
				metrics.userRegister(false, appId);
			} else {
				throw e; // some other error
			}
		}
	} else {
		metrics.userRegister(false, appId);
	}

	// XXX should be a scope object
	let authToken = await DbAuthToken.findOne({
		where: { userId: user.id, deviceId },
		order: { createdDate: "DESC" }
	});
	if (!authToken || authToken.isAboutToExpire()) {
		authToken = await (DbAuthToken.new({ userId: user.id, deviceId }).save());
	}

	return AuthTokenDbToApi(authToken, user, newUser);
}

export type UpdateUserProps = {
	deviceId: string;
	walletAddress: string;
};

export async function updateUser(user: User, props: UpdateUserProps) {
	if (props.walletAddress) {
		const wallets = await user.getWallets();
		const app = (await Application.findOneById(user.appId))!;

		if (!app.allowsNewWallet(wallets.count)) {
			metrics.maxWalletsExceeded(app.id);
			throw MaxWalletsExceeded();
		}

		await user.updateWallet(props.deviceId, props.walletAddress);
		logger().info(`creating stellar wallet for user ${ user.id }: ${ props.walletAddress }`);
		await payment.createWallet(props.walletAddress, user.appId, user.id);
	}

	createWalletAddressUpdateSucceeded(user.id).report();
	metrics.walletAddressUpdate(user.appId);
}

export async function activateUser(authToken: DbAuthToken, user: User): Promise<AuthToken> {
	// no activation needed anymore
	return AuthTokenDbToApi(authToken, user, false);
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

export type UserProfile = {
	stats: UserStats
};

export async function getUserProfile(userId: string): Promise<UserProfile> {
	const data: Array<{ type: string; last_date: string; cnt: number; }> = await Order.queryBuilder("ordr")
		.select("context.type as type")
		.addSelect("MAX(ordr.created_date) as last_date")
		.addSelect("COUNT(*) as cnt")
		.leftJoin("ordr.contexts", "context")
		.where("context.user_id = :userId", { userId })
		.andWhere(new Brackets(qb => {
			qb.where("ordr.status = :status", { status: "completed" })
				.orWhere(
					new Brackets(qb2 => {
						qb2.where("ordr.status IN (:statuses)", { statuses: ["pending", "opened"] })
							.andWhere("ordr.expiration_date > :date", { date: new Date() });
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

	return { stats };
}

export async function logout(user: User, token: DbAuthToken) {
	token.valid = false;
	await token.save();
}
