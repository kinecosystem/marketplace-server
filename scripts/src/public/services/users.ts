import { getManager } from "typeorm";
import { LoggerInstance } from "winston";

import * as db from "../../models/users";

import * as payment from "./payment";
import { pick } from "../../utils";

export type AuthToken = {
	token: string;
	activated: boolean;
	expiration_date: string;
};

function AuthTokenDbToApi(authToken: db.AuthToken, user: db.User, logger: LoggerInstance): AuthToken {
	return { token: authToken.id, activated: user.activated, expiration_date: authToken.expireDate.toISOString() };
}

export async function getOrCreateUserCredentials(
	appUserId: string,
	appId: string,
	walletAddress: string,
	deviceId: string, logger: LoggerInstance): Promise<AuthToken> {

	let user = await db.User.findOne({ appId, appUserId });
	if (!user) {
		// new user
		user = db.User.new({ appUserId, appId, walletAddress });
		await user.save();

		// create wallet with lumens:
		logger.info(`creating stellar wallet for new user ${user.id}: ${user.walletAddress}`);
		await payment.createWallet(user.walletAddress, user.appId, logger);
	} else {
		if (user.walletAddress !== walletAddress) {
			logger.warn(`existing user registered with new wallet ${user.walletAddress} !== ${walletAddress}`);
		}
		logger.info(`returning existing user ${user.id}`);
	}

	// XXX should be a scope object
	const authToken = await (db.AuthToken.new({ userId: user.id, deviceId }).save());
	// XXX should we check for non soon to expire tokens and return them first

	return AuthTokenDbToApi(authToken, user, logger);
}

export async function activateUser(
		authToken: db.AuthToken, user: db.User, logger: LoggerInstance): Promise<AuthToken> {
	if (!user.activated) {
		await getManager().transaction(async mgr => {
			user.activatedDate = new Date();
			await mgr.save(user);

			authToken = db.AuthToken.new(pick(authToken, "userId", "deviceId"));
			await mgr.save(authToken);
			// XXX should we deactivate old tokens?
		});

		// XXX should implement some sort of authtoken scoping that will be encoded into the token:
		// authToken.scope = {tos: true}
		logger.info(`new user activated ${user.id}`);
	} else {
		logger.info(`existing user activated ${user.id}`);
	}

	return AuthTokenDbToApi(authToken, user, logger);
}
