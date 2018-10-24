import { LoggerInstance } from "winston";

import * as metrics from "../../metrics";
import { MaxWalletsExceeded } from "../../errors";
import { Order } from "../../models/orders";
import { Application } from "../../models/applications";
import { User, AuthToken as DbAuthToken } from "../../models/users";

import * as payment from "./payment";
import { readUTCDate } from "../../utils";

export type AuthToken = {
	token: string;
	activated: boolean;
	expiration_date: string;
	app_id: string;
	user_id: string;
	ecosystem_user_id: string;
};

function AuthTokenDbToApi(authToken: DbAuthToken, user: User, logger: LoggerInstance): AuthToken {
	return {
		token: authToken.id,
		activated: true, // always true - activation not needed
		app_id: user.appId,
		user_id: user.appUserId,
		ecosystem_user_id: user.id,
		expiration_date: authToken.expireDate.toISOString()
	};
}

export async function getOrCreateUserCredentials(
	app: Application,
	appUserId: string,
	appId: string,
	walletAddress: string,
	deviceId: string, logger: LoggerInstance): Promise<AuthToken> {

	async function handleExistingUser(existingUser: User) {
		logger.info("found existing user", { appId, appUserId, userId: existingUser.id });
		if (existingUser.walletAddress !== walletAddress) {
			logger.warn(`existing user registered with new wallet ${existingUser.walletAddress} !== ${walletAddress}`);
			if (!app.allowsNewWallet(existingUser.walletCount)) {
				metrics.maxWalletsExceeded();
				throw MaxWalletsExceeded();
			}
			existingUser.walletCount += 1;
			existingUser.walletAddress = walletAddress;
			await existingUser.save();
			await payment.createWallet(existingUser.walletAddress, existingUser.appId, existingUser.id, logger);
			metrics.userRegister(false, true);
		} else {
			metrics.userRegister(false, false);
		}
		logger.info(`returning existing user ${existingUser.id}`);
	}

	let user = await User.findOne({ appId, appUserId });
	if (!user) {
		try {
			logger.info("creating a new user", { appId, appUserId });
			user = User.new({ appUserId, appId, walletAddress });
			await user.save();
			logger.info(`creating stellar wallet for new user ${user.id}: ${user.walletAddress}`);
			await payment.createWallet(user.walletAddress, user.appId, user.id, logger);
			metrics.userRegister(true, true);
		} catch (e) {
			// maybe caught a "violates unique constraint" error, check by finding the user again
			user = await User.findOne({ appId, appUserId });
			if (user) {
				logger.warn("solved user registration race condition");
				await handleExistingUser(user);
			} else {
				throw e; // some other error
			}
		}
	} else {
		await handleExistingUser(user);
	}

	// XXX should be a scope object
	let authToken = await DbAuthToken.findOne({
		where: { userId: user.id, deviceId },
		order: { createdDate: "DESC" }
	});
	if (!authToken || authToken.isAboutToExpire()) {
		authToken = await (DbAuthToken.new({ userId: user.id, deviceId }).save());
	}

	return AuthTokenDbToApi(authToken, user, logger);
}

export async function activateUser(
	authToken: DbAuthToken, user: User, logger: LoggerInstance): Promise<AuthToken> {
	// no activation needed anymore
	return AuthTokenDbToApi(authToken, user, logger);
}

export async function userExists(appId: string, appUserId: string, logger?: LoggerInstance): Promise<boolean> {
	const user = await User.findOne({ appId, appUserId });
	logger && logger.debug(`userExists service appId: ${ appId }, appUserId: ${ appUserId }, user: `, user);
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
		.groupBy("context.type")
		.getRawMany();

	const stats: UserStats = {
		earn_count: 0,
		spend_count: 0
	};

	for (const row of data) {
		if (row.type === "earn") {
			stats.earn_count = row.cnt;
			stats.last_earn_date = readUTCDate(row.last_date).toISOString();
		} else if (row.type === "spend") {
			stats.spend_count = row.cnt;
			stats.last_spend_date = readUTCDate(row.last_date).toISOString();
		}
	}

	return { stats };
}
