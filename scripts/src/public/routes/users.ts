import { Request, RequestHandler, Response } from "express";

import { Application } from "../../models/applications";
import { getDefaultLogger as logger } from "../../logging";
import { InvalidWalletAddress, NoSuchApp, UnknownSignInType } from "../../errors";

import {
	logout as logoutService,
	getOrCreateUserCredentials,
	userExists as userExistsService,
	updateUser as updateUserService,
	activateUser as activateUserService,
	getUserProfile as getUserProfileService
} from "../services/users";
import { SignInContext, validateRegisterJWT, validateWhitelist } from "../services/applications";

export type WalletData = {
	device_id: string;
};

export type CommonSignInData = WalletData & {
	sign_in_type: "jwt" | "whitelist";
};

export type JwtSignInData = CommonSignInData & {
	jwt: string;
	sign_in_type: "jwt";
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

	logger().info("signing in user", { data });
	// XXX should also check which sign in types does the application allow
	if (data.sign_in_type === "jwt") {
		context = await validateRegisterJWT(data.jwt!);
	} else if (data.sign_in_type === "whitelist") {
		context = await validateWhitelist(data.user_id, data.api_key);
	} else {
		throw UnknownSignInType((data as any).sign_in_type);
	}

	const app = await Application.findOneById(context.appId);
	if (!app) {
		throw NoSuchApp(context.appId);
	}
	if (!app.supportsSignInType(data.sign_in_type)) {
		throw UnknownSignInType(data.sign_in_type);
	}

	const authToken = await getOrCreateUserCredentials(
		app,
		context.appUserId,
		context.appId,
		data.device_id);

	res.status(200).send(authToken);
} as any as RequestHandler;

export type UpdateUserRequest = Request & { body: WalletData };

export const updateUser = async function(req: UpdateUserRequest, res: Response) {
	const user = req.context.user!;
	const deviceId = req.body.device_id || req.context.token!.deviceId;
	const walletAddress = req.body.wallet_address;

	logger().info(`updating user ${ user.id }`, { walletAddress, deviceId });

	if (!walletAddress || walletAddress.length !== 56) {
		throw InvalidWalletAddress(walletAddress);
	}

	await updateUserService(user, { deviceId, walletAddress });

	res.status(204).send();
} as any as RequestHandler;

export type UserExistsRequest = Request & { query: { user_id: string; } };

export const userExists = async function(req: UserExistsRequest, res: Response) {
	const appId = req.context.user!.appId;
	logger().debug(`userExists appId: ${ appId }`);

	const userFound = await userExistsService(appId, req.query.user_id);
	res.status(200).send(userFound);
} as any as RequestHandler;

/**
 * user activates by approving TOS
 */
export const activateUser = async function(req: Request, res: Response) {
	const authToken = await activateUserService(req.context.token!, req.context.user!);
	res.status(200).send(authToken);
} as any as RequestHandler;

export type UserInfoRequest = Request & { params: { user_id: string; } };

export const userInfo = async function(req: UserInfoRequest, res: Response) {
	logger().debug(`userInfo userId: ${ req.params.user_id }`);

	if (req.context.user!.appUserId !== req.params.user_id) {
		const userFound = await userExistsService(req.context.user!.appId, req.params.user_id);
		if (userFound) {
			res.status(200).send({});
		} else {
			res.status(404).send();
		}
	} else {
		const profile = await getUserProfileService(req.context.user!.id);
		res.status(200).send(profile);
	}
} as any as RequestHandler;

export const myUserInfo = async function(req: Request, res: Response) {
	req.params.user_id = req.context.user!.appUserId;
	await (userInfo as any)(req as UserInfoRequest, res);
} as any as RequestHandler;

export const logoutUser = async function(req: Request, res: Response) {
	await logoutService(req.context.user!, req.context.token!);
	res.status(204).send();
} as any as RequestHandler;
