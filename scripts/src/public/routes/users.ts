import { Request, Response, RequestHandler } from "express";

import {
	getOrCreateUserCredentials,
	activateUser as activateUserService
} from "../services/users";
import {
	SignInContext,
	validateRegisterJWT,
	validateWhitelist,
	validateApiKey
} from "../services/applications";
import * as db from "../../models/users";

// get a user
export const getUser = async function(req: Request, res: Response) {
	const user = await db.User.findOne({ id: req.query.id });
	res.status(200).send({ user });
} as any as RequestHandler;

type SignInData = {
	sign_in_type: "whitelist" | "jwt";
	user_id: string;
	device_id: string;
	app_id: string;
	api_key: string;
	public_address: string;
	jwt?: string;
};

/**
 * sign in a user,
 * allow either registration with JWT or plain userId to be checked against a whitelist from the given app
 */
export const signInUser = async function(req: Request, res: Response) {
	let context: SignInContext;
	const data: SignInData = req.body;

	req.logger.info("signing in user", { data });
	if (data.sign_in_type === "jwt") {
		context = await validateRegisterJWT(data.jwt!, req.logger);
	} else if (data.sign_in_type === "whitelist") {
		context = await validateWhitelist(data.user_id, data.app_id, data.api_key, req.logger);
	} else {
		throw new Error("unknown sign_in_type: " + data.sign_in_type);
	}

	await validateApiKey(context.apiKey, context.appId, req.logger); // throws

	const { token, activated, expiration_date } = await getOrCreateUserCredentials(
		context.appUserId,
		context.appId,
		req.body.public_address,
		req.body.device_id, req.logger);

	res.status(200).send({ token, activated, expiration_date });
} as any as RequestHandler;

/**
 * user activates by approving TOS
 */
export const activateUser = async function(req: Request, res: Response) {
	const { token, activated, expiration_date } = await activateUserService(req.context.token!, req.context.user!, req.logger);
	res.status(200).send({ token, activated, expiration_date });
} as any as RequestHandler;
