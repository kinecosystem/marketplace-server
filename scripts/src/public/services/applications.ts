import { getDefaultLogger as log } from "../../logging";

import { verify as verifyJwt } from "../jwt";
import { InvalidApiKey } from "../../errors";
import { Application, AppWhitelists } from "../../models/applications";

export type RegisterPayload = {
	user_id: string;
	api_key: string;
};
export type SignInContext = {
	appId: string;
	appUserId: string;
};

export async function validateRegisterJWT(jwt: string): Promise<SignInContext> {
	const decoded = await verifyJwt<RegisterPayload, "register">(jwt);
	const appId = decoded.payload.iss;
	const appUserId = decoded.payload.user_id;

	return { appUserId, appId };
}

export async function validateWhitelist(
	appUserId: string, apiKey: string): Promise<SignInContext> {
	// check if apiKey matches appId
	const app = await Application.findOne({ apiKey });
	if (!app) {
		throw InvalidApiKey(apiKey);
	}

	// check if userId is whitelisted in app
	log().info(`checking if ${ appUserId } is whitelisted for ${ app.id }`);
	const result = await AppWhitelists.findOne({ appUserId, appId: app.id });
	if (result) {
		return { appUserId, appId: app.id };
	}
	// XXX raise an exception
	log().warn(`user ${appUserId} not found in whitelist for app ${ app.id }`);

	return { appUserId, appId: app.id };
}
