import { LoggerInstance } from "winston";

import { verifyJWT } from "../../jwt";
import { Application, AppWhitelists } from "../../models/applications";

export type RegisterPayload = {
	user_id: string;
	api_key: string;
};
export type SignInContext = {
	appId: string;
	appUserId: string;
	apiKey: string;
};
export async function validateRegisterJWT(jwt: string, logger: LoggerInstance): Promise<SignInContext> {
	const decoded = await verifyJWT<RegisterPayload>(jwt);
	const appId = decoded.payload.iss;
	const apiKey = decoded.payload.api_key;
	const appUserId = decoded.payload.user_id;

	return { appUserId, appId, apiKey };
}

export type SpendPayloadOffer = {
	id: string;
	title: string;
	description: string;
	amount: number;
	wallet_address: string;
};
export type SpendPayload = {
	offer: SpendPayloadOffer;
};
export async function validateSpendJWT(jwt: string, logger: LoggerInstance): Promise<SpendPayloadOffer> {
	const decoded = await verifyJWT<SpendPayload>(jwt);
	return decoded.payload.offer;
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
