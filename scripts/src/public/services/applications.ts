import { LoggerInstance } from "winston";

import { verify as verifyJwt } from "../jwt";
import { InvalidApiKey } from "../../errors";
import { Application, AppWhitelists } from "../../models/applications";

export type RegisterPayload = {
	user_id: string;
	api_key: string;

	// TEMP:JID_MIGRATION
	user_jid?: string;
};
export type SignInContext = {
	appId: string;
	appUserId: string;

	// TEMP:JID_MIGRATION
	appUserJid: string | null;
};

export async function validateRegisterJWT(jwt: string, logger: LoggerInstance): Promise<SignInContext> {
	const decoded = await verifyJwt<RegisterPayload, "register">(jwt, logger);
	const appId = decoded.payload.iss;
	const appUserId = decoded.payload.user_id;

	// TEMP:JID_MIGRATION
	const appUserJid = decoded.payload.user_jid || null;

	return { appUserId, appId, appUserJid };
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
		return { appUserId, appId: app.id, appUserJid: null };
	}

	// XXX raise an exception
	logger.warn(`user ${appUserId} not found in whitelist for app ${ app.id }`);

	return { appUserId, appId: app.id, appUserJid: null };
}
