import * as metrics from "../../metrics";
import { getDefaultLogger as logger } from "../../logging";
import { MaxWalletsExceeded } from "../../errors";
import { Order } from "../../models/orders";
import { Application } from "../../models/applications";
import { User, AuthToken as DbAuthToken } from "../../models/users";

import * as payment from "./payment";
import { readUTCDate } from "../../utils/utils";
import { Brackets } from "typeorm";
import { assertRateLimitRegistration } from "../../utils/rate_limit";
import * as moment from "moment";

export type AuthToken = {
	token: string;
	activated: boolean;
	expiration_date: string;
	app_id: string;
	user_id: string;
	ecosystem_user_id: string;
};

function AuthTokenDbToApi(authToken: DbAuthToken, user: User): AuthToken {
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
	deviceId: string): Promise<AuthToken> {

	async function handleExistingUser(existingUser: User) {
		logger().info("found existing user", { appId, appUserId, userId: existingUser.id });
		if (existingUser.walletAddress !== walletAddress) {
			logger().warn(`existing user registered with new wallet ${ existingUser.walletAddress } !== ${ walletAddress }`);
			if (!app.allowsNewWallet(existingUser.walletCount)) {
				metrics.maxWalletsExceeded(appId);
				throw MaxWalletsExceeded();
			}
			existingUser.walletCount += 1;
			existingUser.walletAddress = walletAddress;
			await existingUser.save();
			await payment.createWallet(existingUser.walletAddress, existingUser.appId, existingUser.id);
			metrics.userRegister(false, true, appId);
		} else {
			metrics.userRegister(false, false, appId);
		}
		logger().info(`returning existing user ${ existingUser.id }`);
	}

	let user = await User.findOne({ appId, appUserId });
	if (!user) {
		await assertRateLimitRegistration(app);
		try {
			logger().info("creating a new user", { appId, appUserId });

			user = User.new({ appUserId, appId, walletAddress, isNew: true });
			await user.save();
			logger().info(`creating stellar wallet for new user ${ user.id }: ${ user.walletAddress }`);
			await payment.createWallet(user.walletAddress, user.appId, user.id);
			metrics.userRegister(true, true, appId);
		} catch (e) {
			// maybe caught a "violates unique constraint" error, check by finding the user again
			user = await User.findOne({ appId, appUserId });
			if (user) {
				logger().warn("solved user registration race condition");
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

	return AuthTokenDbToApi(authToken, user);
}

export async function activateUser(
	authToken: DbAuthToken, user: User): Promise<AuthToken> {
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

export type UserProfile = {
	stats: UserStats
};

export async function getUserProfile(userId: string): Promise<UserProfile> {
	const data: Array<{ type: string; last_date: string; cnt: number; }> = await Order.queryBuilder("ordr")
		.select("context.type", "type")
		.addSelect("MAX(ordr.createdDate)", "last_date")
		.addSelect("COUNT(*)", "cnt")
		.leftJoin("ordr.contexts", "context")
		.where("context.userId = :userId", { userId })
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

	return { stats };
}
