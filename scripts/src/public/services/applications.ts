import { LoggerInstance } from "winston";

import { InvalidApiKey, InvalidExternalOrderJWT } from "../../errors";
import { Application, AppWhitelists } from "../../models/applications";

import { JWTClaims, verify as verifyJWT } from "../jwt";

export type RegisterPayload = {
	user_id: string;
	api_key: string;
};

export type SignInContext = {
	appId: string;
	appUserId: string;
};
export type ExternalOfferPayload = {
	id: string;
	title: string;
	description: string;
	amount: number;
};

export type ExternalSpendOfferPayload = ExternalOfferPayload & {
	wallet_address: string;
};

export type EarnPayload = {
	user_id: string;
	offer: ExternalOfferPayload;
};

export type SpendPayload = {
	offer: ExternalSpendOfferPayload;
};

export type ExternalEarnOrderJWT = JWTClaims<"earn"> & EarnPayload;
export type ExternalSpendOrderJWT = JWTClaims<"spend"> & SpendPayload;
export type ExternalOrderJWT = ExternalEarnOrderJWT | ExternalSpendOrderJWT;
export async function validateExternalOrderJWT(jwt: string, logger: LoggerInstance): Promise<ExternalOrderJWT> {
	const decoded = await verifyJWT<SpendPayload | EarnPayload, "spend" | "earn">(jwt, logger);

	if (decoded.payload.sub !== "earn" && decoded.payload.sub !== "spend") {
		throw InvalidExternalOrderJWT();
	}

	return decoded.payload as ExternalOrderJWT;
}

export async function validateRegisterJWT(jwt: string, logger: LoggerInstance): Promise<SignInContext> {
	const decoded = await verifyJWT<RegisterPayload, "register">(jwt, logger);
	const appId = decoded.payload.iss;
	const appUserId = decoded.payload.user_id;

	return { appUserId, appId };
}

export async function validateWhitelist(
	appUserId: string, apiKey: string, logger: LoggerInstance): Promise<SignInContext> {
	// check if apiKey matches appId
	const app = await Application.findOne({ apiKey });
	if (!app) {
		throw InvalidApiKey(apiKey);
	}

	// check if userId is whitelisted in app
	logger.info(`checking if ${ appUserId } is whitelisted for ${ app.id }`);
	const result = await AppWhitelists.findOne({ appUserId, appId: app.id });
	if (result) {
		return { appUserId, appId: app.id };
	}
	// XXX raise an exception
	logger.warn(`user ${appUserId} not found in whitelist for app ${ app.id }`);

	return { appUserId, appId: app.id };
}
