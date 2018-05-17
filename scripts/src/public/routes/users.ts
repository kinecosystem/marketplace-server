import { Request, Response, RequestHandler } from "express";

import * as db from "../../models/users";
import { UnknownSignInType } from "../../errors";

import {
	getOrCreateUserCredentials,
	activateUser as activateUserService
} from "../services/users";
import {
	SignInContext,
	validateRegisterJWT,
	validateWhitelist
} from "../services/applications";

type CommonSignInData = {
	sign_in_type: "jwt" | "whitelist";
	device_id: string;
	wallet_address: string;
};

type JwtSignInData = CommonSignInData & {
	sign_in_type: "jwt";
	jwt: string;
};

type WhitelistSignInData = CommonSignInData & {
	sign_in_type: "whitelist";
	user_id: string;
	api_key: string;
};

// get a user
export const getUser = async function(req: Request, res: Response) {
	console.log("get User!");
	const user = await db.User.findOne({ id: req.query.id });
	res.status(200).send({ user });
} as any as RequestHandler;

type RegisterRequest = Request & { body: WhitelistSignInData | JwtSignInData };

/**
 * sign in a user,
 * allow either registration with JWT or plain userId to be checked against a whitelist from the given app
 */
export const signInUser = async function(req: RegisterRequest, res: Response) {
	let context: SignInContext;
	const data: WhitelistSignInData | JwtSignInData = req.body;

	req.logger.info("signing in user", { data });
	// XXX should also check which sign in types does the application allow
	if (data.sign_in_type === "jwt") {
		context = await validateRegisterJWT(data.jwt!, req.logger);
	} else if (data.sign_in_type === "whitelist") {
		context = await validateWhitelist(data.user_id, data.api_key, req.logger);
	} else {
		throw UnknownSignInType((data as any).sign_in_type);
	}

	const authToken = await getOrCreateUserCredentials(
		context.appUserId,
		context.appId,
		data.wallet_address,
		data.device_id,
		req.logger);

	res.status(200).send(authToken);
} as any as RequestHandler;

/**
 * user activates by approving TOS
 */
export const activateUser = async function(req: Request, res: Response) {
	const authToken = await activateUserService(req.context.token!, req.context.user!, req.logger);
	res.status(200).send(authToken);
} as any as RequestHandler;
