import { Request, Response, RequestHandler } from "express";
import { NoSuchApp, UnknownSignInType } from "../../errors";

import {
	getOrCreateUserCredentials,
	userExists as userExistsService,
	activateUser as activateUserService
} from "../services/users";
import {
	SignInContext,
	validateRegisterJWT,
	validateWhitelist
} from "../services/applications";
import { Application, SignInType } from "../../models/applications";
import { getConfig } from "../config";

export type CommonSignInData = {
	sign_in_type: "jwt" | "whitelist";
	device_id: string;
	wallet_address: string;
};

export type JwtSignInData = CommonSignInData & {
	sign_in_type: "jwt";
	jwt: string;
};

export type WhitelistSignInData = CommonSignInData & {
	sign_in_type: "whitelist";
	user_id: string;
	api_key: string;
};

export type RegisterRequest = Request & { body: WhitelistSignInData | JwtSignInData };

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

	const app = await Application.findOneById(context.appId);
	if (!app) {
		throw NoSuchApp(context.appId);
	}
	if (!app.supportsSignInType(data.sign_in_type, getConfig().sign_in_types as SignInType[])) {
		throw UnknownSignInType((data as any).sign_in_type);
	}

	const authToken = await getOrCreateUserCredentials(
		app,
		context.appUserId,
		context.appId,
		data.wallet_address,
		data.device_id,
		req.logger);

	res.status(200).send(authToken);
} as any as RequestHandler;

export type UserExistsRequest = Request & { query: { user_id: string; } };

export const userExists = async function(req: UserExistsRequest, res: Response) {
	const appId = req.context.user!.appId;
	const userFound = await userExistsService(appId, req.query.user_id);
	res.status(200).send(userFound);
} as any as RequestHandler;

/**
 * user activates by approving TOS
 */
export const activateUser = async function(req: Request, res: Response) {
	const authToken = await activateUserService(req.context.token!, req.context.user!, req.logger);
	res.status(200).send(authToken);
} as any as RequestHandler;
