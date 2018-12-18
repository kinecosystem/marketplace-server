import { Request, RequestHandler, Response } from "express";
import { InvalidWalletAddress, NoSuchApp, UnknownSignInType } from "../../errors";
import { getDefaultLogger as logger } from "../../logging";

import {
	activateUser as activateUserService,
	getOrCreateUserCredentials,
	getUserProfile as getUserProfileService,
	userExists as userExistsService
} from "../services/users";
import * as metrics from "../../metrics";
import { SignInContext, validateRegisterJWT, validateWhitelist } from "../services/applications";
import { Application, SignInType } from "../../models/applications";
import { getConfig } from "../config";
import { create as createWalletAddressUpdateSucceeded } from "../../analytics/events/wallet_address_update_succeeded";

export type WalletData = { wallet_address: string };

export type CommonSignInData = WalletData & {
	sign_in_type: "jwt" | "whitelist";
	device_id: string;
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
	if (!app.supportsSignInType(data.sign_in_type, getConfig().sign_in_types as SignInType[])) {
		throw UnknownSignInType((data as any).sign_in_type);
	}

	const authToken = await getOrCreateUserCredentials(
		app,
		context.appUserId,
		context.appId,
		data.wallet_address,
		data.device_id);

	res.status(200).send(authToken);
} as any as RequestHandler;

export type UpdateUserRequest = Request & { body: WalletData };

export const updateUser = async function(req: UpdateUserRequest, res: Response) {
	const context = req.context;
	const walletAddress = req.body.wallet_address;
	const userId = context.user!.id;
	logger().info(`updating user ${ walletAddress }`, { walletAddress, userId });

	if (!walletAddress || walletAddress.length !== 56) {
		throw InvalidWalletAddress(walletAddress);
	}

	context.user!.walletAddress = walletAddress;
	await context.user!.save();

	createWalletAddressUpdateSucceeded(userId).report();
	metrics.walletAddressUpdate(context.user!.appId);
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
