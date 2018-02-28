import * as jsonwebtoken from "jsonwebtoken";
import * as db from "../models/users";
import { getLogger } from "../logging";
import { getManager } from "typeorm";
import * as payment from "./payment";

const logger = getLogger();

export type AuthToken = {
	token: string;
	activated: boolean;
	expiration_date: string;
};

type JWTClaims = {
	iss: string; // issuer
	exp: number; // expiration
	iat: number; // issued at
	sub: string; // subject
};

type JWTContent = {
	header: {
		typ: string;
		alg: string;
		key: string;
	};
	payload: JWTClaims & {
		// custom claims
		user_id: string;
	};
	signature: string;
};

function getApplicationPublicKey(applicationId: string, keyId: string) {
	// return the public key for the given application.
	// an application might have multiple keys. each key identified by key_id.

	const publicKeys = {
		fancy: { 1: "sdfnksdjfhlskjfhksdf", 2: "23423423423423" },
		kik: {
			one: "-----BEGIN PUBLIC KEY-----\n" +
			"MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDdlatRjRjogo3WojgGHFHYLugdUWAY9iR3fy4ar" +
			"WNA1KoS8kVw33cJibXr8bvwUAUparCwlvdbH6dvEOfou0/gCFQsHUfQrSDv+MuSUMAe8jzKE4qW+j" +
			"K+xQU9a03GUnKHkkle+Q0pX/g6jXZ7r1/xAK5Do2kQ+X5xK9cipRgEKwIDAQAB\n" +
			"-----END PUBLIC KEY-----",
		},
	};

	return publicKeys[applicationId][keyId];
}

export function validateJWT(jwt: string): { appUserId: string, appId: string } {
	const decoded = jsonwebtoken.decode(jwt, { complete: true }) as JWTContent;
	const publicKey = getApplicationPublicKey(decoded.payload.iss, decoded.header.key);

	jsonwebtoken.verify(jwt, publicKey);

	return {
		appUserId: decoded.payload.user_id,
		appId: decoded.payload.iss,
	};
}

export function validateWhitelist(appUserId: string, appId: string): { appUserId: string, appId: string } {
	// check if userId is whitelisted in app
	logger.info(`checking if ${appUserId} is whitelisted for ${appId}`);
	return { appUserId, appId };
}

export async function getOrCreateUserCredentials(
	appUserId: string,
	appId: string,
	walletAddress: string,
	deviceId: string): Promise<AuthToken> {

	let user = await db.User.findOne({ appId, appUserId });
	if (!user) {
		// new user
		user = new db.User(appUserId, appId, walletAddress);
		user.activatedDate = new Date(); // XXX this will make client skip TOS
		await user.save();
		// create wallet with lumens:
		logger.info(`creating stellar wallet for new user ${user.id}: ${user.walletAddress}`);
		await payment.createWallet(user.walletAddress, user.appId);
	} else {
		if (user.walletAddress !== walletAddress) {
			logger.warning(`existing user registered with new wallet ${user.walletAddress} !== ${walletAddress}`);
		}
		logger.info(`returning existing user ${user.id}`);
	}

	// XXX should be a scope object
	const authToken = await (new db.AuthToken(user.id, deviceId, true).save());

	return { token: authToken.id, activated: user.activated, expiration_date: authToken.expireDate.toISOString() };
}

export async function activateUser(authToken: db.AuthToken, user: db.User): Promise<AuthToken> {
	if (!user.activated) {
		await getManager().transaction(async mgr => {
			user.activatedDate = new Date();
			await mgr.save(user);

			authToken = new db.AuthToken(authToken.userId, authToken.deviceId, true);
			await mgr.save(authToken);
		});

		// XXX should implement some sort of authtoken scoping that will be encoded into the token:
		// authToken.scope = {tos: true}

		// XXX we want the auth token to be some sort of encoded payload so db access isn't needed to authenticate
		// create an order for Getting Started Invisible Offer
		// order = Offers.createOrder(GETTING_STARTED_OFFER_ID)
		// order.submitEarn(); which does:
		// tx_id = kin.sdk.payTo(public_address, order.id);
		logger.info(`funding user KIN ${user.id}`);

		const txId = null; // XXX should I return tx_id here?
		// XXX should the client make a separate call to create an order and submit it like the rest of the order flows?
	} else {
		logger.info(`existing user activated ${user.id}`);
	}

	return { token: authToken.id, activated: user.activated, expiration_date: authToken.expireDate.toISOString() };
}
