import { LoggerInstance } from "winston";

import { verify as verifyJWT } from "../jwt";
import { Application, AppWhitelists } from "../../models/applications";

export type RegisterPayload = {
	user_id: string;
	api_key: string;
};
export type SignInContext = {
	appId: string;
	appUserId: string;
};

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

export async function validateRegisterJWT(jwt: string, logger: LoggerInstance): Promise<SignInContext> {
	const decoded = await verifyJWT<RegisterPayload>(jwt);
	const appId = decoded.payload.iss;
	const appUserId = decoded.payload.user_id;

	return { appUserId, appId };
}

export async function validateWhitelist(
	appUserId: string, apiKey: string, logger: LoggerInstance): Promise<SignInContext> {
	// check if apiKey matches appId
	const app = await Application.findOne({ apiKey });
	if (!app) {
		throw Error(`invalid api_key ${ apiKey }`);
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
