import * as jsonwebtoken from "jsonwebtoken";
import { LoggerInstance } from "winston";

import { Application, AppWhitelists } from "../../models/applications";

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
		api_key: string;
	};
	signature: string;
};

export type SignInContext = {
	appId: string;
	appUserId: string;
	apiKey: string;
};

export async function validateJWT(jwt: string, logger: LoggerInstance): Promise<SignInContext> {
	const decoded = jsonwebtoken.decode(jwt, { complete: true }) as JWTContent;
	const appId = decoded.payload.iss;
	const appUserId = decoded.payload.user_id;
	const apiKey = decoded.payload.api_key;
	const jwtKeyId = decoded.header.key;

	const app = await Application.findOneById(appId);
	const publicKey = app.jwtPublicKeys[jwtKeyId];

	jsonwebtoken.verify(jwt, publicKey);  // throws

	return { appUserId, appId, apiKey };
}

export async function validateWhitelist(
	appUserId: string, appId: string, apiKey: string, logger: LoggerInstance): Promise<SignInContext> {
	// check if userId is whitelisted in app
	logger.info(`checking if ${appUserId} is whitelisted for ${appId}`);
	const result = await AppWhitelists.findOne({ appUserId, appId });
	if (result) {
		return { appUserId, appId, apiKey };
	}
	// XXX raise an exception
	logger.warn(`user ${appUserId} not found in whitelist for app ${appId}`);
	return { appUserId, appId, apiKey };
}

export async function validateApiKey(apiKey: string, appId: string, logger: LoggerInstance) {
	const app = await Application.findOne({ apiKey });
	if (!app || app.id !== appId) {
		throw Error("invalid api_key, app_id pair");
	}
}
