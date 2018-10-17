import { getManager } from "typeorm";
import { LoggerInstance } from "winston";

import * as db from "../../models/users";

import * as payment from "./payment";
import { pick } from "../../utils";
import * as metrics from "../../metrics";
import { Application } from "../../models/applications";
import { MaxWalletsExceeded } from "../../errors";
import { User } from "../../models/users";

export type AuthToken = {
	token: string;
	activated: boolean;
	expiration_date: string;
	app_id: string;
	user_id: string;
	ecosystem_user_id: string;
};

function AuthTokenDbToApi(authToken: db.AuthToken, user: db.User, logger: LoggerInstance): AuthToken {
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

	let user = await db.User.findOne({ appId, appUserId });
	if (!user) {
		try {
			logger.info("creating a new user", { appId, appUserId });
			user = db.User.new({ appUserId, appId, walletAddress });
			await user.save();
			logger.info(`creating stellar wallet for new user ${user.id}: ${user.walletAddress}`);
			await payment.createWallet(user.walletAddress, user.appId, user.id, logger);
			metrics.userRegister(true, true);
		} catch (e) {
			// maybe caught a "violates unique constraint" error, check by finding the user again
			user = await db.User.findOne({ appId, appUserId });
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
	let authToken = await db.AuthToken.findOne({
		where: { userId: user.id, deviceId },
		order: { createdDate: "DESC" }
	});
	if (!authToken || authToken.isAboutToExpire()) {
		authToken = await (db.AuthToken.new({ userId: user.id, deviceId }).save());
	}

	return AuthTokenDbToApi(authToken, user, logger);
}

export async function activateUser(
	authToken: db.AuthToken, user: db.User, logger: LoggerInstance): Promise<AuthToken> {
	// no activation needed anymore
	return AuthTokenDbToApi(authToken, user, logger);
}

export async function userExists(appId: string, appUserId: string, logger?: LoggerInstance): Promise<boolean> {
	const user = await db.User.findOne({ appId, appUserId });
	logger && logger.debug(`userExists service appId: ${ appId }, appUserId: ${ appUserId }, user: `, user);
	return user !== undefined;
}
