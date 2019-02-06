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
	v1GetOrCreateUserCredentials,
	getUserProfile as getUserProfileService
} from "../services/users";
import {
	SignInContext,
	V1SignInContext,
	validateRegisterJWT,
	v1ValidateRegisterJWT,
	validateWhitelist,
	v1ValidateWhitelist,
} from "../services/applications";

import { AuthenticatedRequest } from "../auth";

export type V1WalletData = {
	wallet_address: string;
};

export type V1CommonSignInData = V1WalletData & {
	sign_in_type: "jwt" | "whitelist";
	device_id: string;
};

export type V1JwtSignInData = V1CommonSignInData & {
	jwt: string;
	sign_in_type: "jwt";
};

export type V1WhitelistSignInData = V1CommonSignInData & {
	sign_in_type: "whitelist";
	user_id: string;
	api_key: string;
};

export type V1RegisterRequest = Request & { body: V1WhitelistSignInData | V1JwtSignInData };

/**
 * sign in a user,
 * allow either registration with JWT or plain userId to be checked against a whitelist from the given app
 */
export const v1SignInUser = async function(req: V1RegisterRequest, res: Response) {
	let context: V1SignInContext;
	const data: V1WhitelistSignInData | V1JwtSignInData = req.body;

	logger().info("signing in user", { data });
	// XXX should also check which sign in types does the application allow
	if (data.sign_in_type === "jwt") {
		context = await v1ValidateRegisterJWT(data.jwt!);
	} else if (data.sign_in_type === "whitelist") {
		context = await v1ValidateWhitelist(data.user_id, data.api_key);
	} else {
		throw UnknownSignInType((data as any).sign_in_type);
	}

	const app = await Application.get(context.appId);
	if (!app) {
		throw NoSuchApp(context.appId);
	}
	if (!app.supportsSignInType(data.sign_in_type)) {
		throw UnknownSignInType(data.sign_in_type);
	}

	const authToken = await v1GetOrCreateUserCredentials(
		app,
		context.appUserId,
		data.wallet_address,
		data.device_id);

	res.status(200).send(authToken);
} as any as RequestHandler;

export type WalletData = {};

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
	device_id: string;
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
		context = await validateWhitelist(data.user_id, data.device_id, data.api_key);
	} else {
		throw UnknownSignInType((data as any).sign_in_type);
	}

	const app = (await Application.all()).get(context.appId);
	if (!app) {
		throw NoSuchApp(context.appId);
	}
	if (!app.supportsSignInType(data.sign_in_type)) {
		throw UnknownSignInType(data.sign_in_type);
	}

	const authToken = await getOrCreateUserCredentials(
		app,
		context.appUserId,
		context.deviceId);

	res.status(200).send(authToken);
} as any as RequestHandler;

export type UpdateUserRequest = AuthenticatedRequest & { body: WalletData };

export const updateUser = async function(req: UpdateUserRequest, res: Response) {
	const user = req.context.user;
	const deviceId = req.body.device_id || req.context.token.deviceId;
	const walletAddress = req.body.wallet_address;

	logger().info(`updating user ${ user.id }`, { walletAddress, deviceId });

	if (!walletAddress || walletAddress.length !== 56) {
		throw InvalidWalletAddress(walletAddress);
	}

	await updateUserService(user, { deviceId, walletAddress });

	res.status(204).send();
} as any as RequestHandler;

export type UserExistsRequest = AuthenticatedRequest & { query: { user_id: string; } };

export const userExists = async function(req: UserExistsRequest, res: Response) {
	const appId = req.context.user.appId;
	logger().debug(`userExists appId: ${ appId }`);

	const userFound = await userExistsService(appId, req.query.user_id);
	res.status(200).send(userFound);
} as any as RequestHandler;

/**
 * user activates by approving TOS
 */
export const activateUser = async function(req: AuthenticatedRequest, res: Response) {
	const authToken = await activateUserService(req.context.token, req.context.user);
	res.status(200).send(authToken);
} as any as RequestHandler;

export type UserInfoRequest = AuthenticatedRequest & { params: { user_id: string; } };

export const v1UserInfo = async function(req: UserInfoRequest, res: Response) {
	logger().debug(`userInfo userId: ${ req.params.user_id }`);

	if (req.context.user.appUserId !== req.params.user_id) {
		const userFound = await userExistsService(req.context.user.appId, req.params.user_id);
		if (userFound) {
			res.status(200).send({});
		} else {
			res.status(404).send();
		}
	} else {
		const profile = await getUserProfileService(req.context.user.id, req.context.token.deviceId);
		delete profile.created_date;
		delete profile.current_wallet;
		res.status(200).send(profile);
	}
} as any as RequestHandler;

export const v1MyUserInfo = async function(req: AuthenticatedRequest, res: Response) {
	req.params.user_id = req.context.user.appUserId;
	await (v1UserInfo as any)(req as UserInfoRequest, res);
} as any as RequestHandler;

export const userInfo = async function(req: UserInfoRequest, res: Response) {
	logger().debug(`userInfo userId: ${ req.params.user_id }`);

	if (req.context.user.appUserId !== req.params.user_id) {
		const userFound = await userExistsService(req.context.user.appId, req.params.user_id);
		if (userFound) {
			res.status(200).send({});
		} else {
			res.status(404).send();
		}
	} else {
		const profile = await getUserProfileService(req.context.user.id, req.context.token.deviceId);
		res.status(200).send(profile);
	}
} as any as RequestHandler;

export const myUserInfo = async function(req: AuthenticatedRequest, res: Response) {
	req.params.user_id = req.context.user.appUserId;
	await (userInfo as any)(req as UserInfoRequest, res);
} as any as RequestHandler;

export const logoutUser = async function(req: AuthenticatedRequest, res: Response) {
	await logoutService(req.context.user, req.context.token);
	res.status(204).send();
} as any as RequestHandler;
