import { getDefaultLogger as logger } from "../../logging";

import { verify as verifyJwt } from "../jwt";
import { InvalidApiKey, MissingFieldJWT, NoSuchApp } from "../../errors";
import { Application, AppWhitelists } from "../../models/applications";
import { BlockchainVersion } from "../../models/offers";

export type RegisterPayload = {
	user_id: string;
	api_key: string;
	device_id: string;
};
export type SignInContext = {
	appId: string;
	deviceId: string;
	appUserId: string;
};

export type V1RegisterPayload = {
	user_id: string;
	api_key: string;
};
export type V1SignInContext = {
	appId: string;
	appUserId: string;
};

export async function validateRegisterJWT(jwt: string): Promise<SignInContext> {
	const decoded = await verifyJwt<Partial<RegisterPayload>, "register">(jwt);

	// payload.user_id field is mandatory
	if (!decoded.payload.user_id) {
		throw MissingFieldJWT("user_id");
	}
	if (!decoded.payload.device_id) {
		throw MissingFieldJWT("device_id");
	}

	const appId = decoded.payload.iss;
	const appUserId = decoded.payload.user_id;
	const deviceId = decoded.payload.device_id;

	return { appUserId, appId, deviceId };
}

export async function v1ValidateRegisterJWT(jwt: string): Promise<V1SignInContext> {
	const decoded = await verifyJwt<Partial<V1RegisterPayload>, "register">(jwt);

	// payload.user_id field is mandatory
	if (!decoded.payload.user_id) {
		throw MissingFieldJWT("user_id");
	}

	const appId = decoded.payload.iss;
	const appUserId = decoded.payload.user_id;

	return { appUserId, appId };
}

export async function validateWhitelist(appUserId: string, deviceId: string, apiKey: string): Promise<SignInContext> {
	// check if apiKey matches appId
	const app = await Application.findOne({ apiKey });
	if (!app) {
		throw InvalidApiKey(apiKey);
	}

	// check if userId is whitelisted in app
	logger().info(`checking if ${ appUserId } is whitelisted for ${ app.id }`);
	const result = await AppWhitelists.findOne({ appUserId, appId: app.id });
	if (result) {
		return { appUserId, deviceId, appId: app.id };
	}
	// XXX raise an exception
	logger().warn(`user ${appUserId} not found in whitelist for app ${ app.id }`);

	return { appUserId, deviceId, appId: app.id };
}

export async function v1ValidateWhitelist(appUserId: string, apiKey: string): Promise<V1SignInContext> {
	// check if apiKey matches appId
	const app = await Application.findOne({ apiKey });
	if (!app) {
		throw InvalidApiKey(apiKey);
	}

	// check if userId is whitelisted in app
	logger().info(`checking if ${ appUserId } is whitelisted for ${ app.id }`);
	const result = await AppWhitelists.findOne({ appUserId, appId: app.id });
	if (result) {
		return { appUserId, appId: app.id };
	}
	// XXX raise an exception
	logger().warn(`user ${appUserId} not found in whitelist for app ${ app.id }`);

	return { appUserId, appId: app.id };
}

export async function getAppBlockchainVersion(app_id: string): Promise<BlockchainVersion> {
	const app = await Application.findOneById(app_id);
	if (!app) {
		throw NoSuchApp(app_id);
	}
	return app.config.blockchain_version;
}

export async function setAppBlockchainVersion(app_id: string, blockchain_version: BlockchainVersion): Promise<void> {
	const app = await Application.findOneById(app_id);
	if (!app) {
		throw NoSuchApp(app_id);
	}

	app.config.blockchain_version = blockchain_version;
	await Application.createQueryBuilder()
		.update("applications")
		.set({ config : app.config })
		.where("id = :id", { id : app_id })
		.execute();
}
