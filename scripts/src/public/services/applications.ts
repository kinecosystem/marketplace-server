import { LoggerInstance } from "winston";

import { InvalidApiKey } from "../../errors";
import { Application, AppWhitelists } from "../../models/applications";

import { verify as verifyJWT } from "../jwt";

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
	wallet_address: string;
};
export type EarnPayload = {
	user_id: string;
	offer: ExternalOfferPayload;
};
export type SpendPayload = {
	offer: ExternalOfferPayload;
};

export async function validateExternalOrderJWT(jwt: string, logger: LoggerInstance) {
	const decoded = await verifyJWT<SpendPayload | EarnPayload, "spend" | "earn">(jwt, logger);
	return decoded.payload;
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
