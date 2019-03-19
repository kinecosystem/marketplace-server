import * as express from "express";

import { statusHandler } from "../middleware";

import { getOffers } from "./offers";
import {
	getConfigHandler,
	getAppBlockchainVersion
} from "./config";
import {
	userInfo,
	myUserInfo,
	v1UserInfo,
	signInUser,
	updateUser,
	userExists,
	logoutUser,
	activateUser,
	v1SignInUser,
	v1MyUserInfo,
} from "./users";
import {
	cancelOrder,
	changeOrder,
	createExternalOrder,
	v1CreateExternalOrder,
	createMarketplaceOrder,
	getOrder,
	getOrderHistory,
	submitOrder,
	submitWhitelistOrder,
} from "./orders";
import { authenticateUser } from "../auth";

export function createRoutes(app: express.Express, pathPrefix?: string) {
	function prefix(path: string): string {
		if (!pathPrefix) {
			return path;
		}
		return `${ pathPrefix }/${ path }`;
	}

	app.get(prefix("offers/"), authenticateUser, getOffers);

	app.post(prefix("offers/external/orders"), authenticateUser, createExternalOrder);
	app.post(prefix("offers/:offer_id/orders"), authenticateUser, createMarketplaceOrder);

	app.get(prefix("orders/"), authenticateUser, getOrderHistory);
	app.get(prefix("orders/:order_id"), authenticateUser, getOrder);
	app.post(prefix("orders/:order_id"), authenticateUser, submitOrder);
	app.delete(prefix("orders/:order_id"), authenticateUser, cancelOrder);
	app.patch(prefix("orders/:order_id"), authenticateUser, changeOrder);

	app.post(prefix("users/me/activate"), authenticateUser, activateUser);
	app.get(prefix("users/exists"), authenticateUser, userExists);
	app.get(prefix("users/me"), authenticateUser, myUserInfo);
	app.get(prefix("users/:user_id"), authenticateUser, userInfo);

	app.patch(prefix("users/me"), authenticateUser, updateUser);
	app.delete(prefix("users/me/session"), authenticateUser, logoutUser);
	app.post(prefix("users/"), signInUser);

	app.get(prefix("config/"), getConfigHandler);
	app.get(prefix("applications/:app_id/blockchain_version"), getAppBlockchainVersion);
	app.get("/status", statusHandler);
}

export function createV1Routes(app: express.Express, pathPrefix?: string) {
	function prefix(path: string): string {
		if (!pathPrefix) {
			return path;
		}
		return `${ pathPrefix }/${ path }`;
	}

	app.get(prefix("offers/"), authenticateUser, getOffers);

	app.post(prefix("offers/external/orders"), authenticateUser, v1CreateExternalOrder);
	app.post(prefix("offers/:offer_id/orders"), authenticateUser, createMarketplaceOrder);

	app.get(prefix("orders/"), authenticateUser, getOrderHistory);
	app.get(prefix("orders/:order_id"), authenticateUser, getOrder);
	app.post(prefix("orders/:order_id"), authenticateUser, submitOrder);
	app.delete(prefix("orders/:order_id"), authenticateUser, cancelOrder);
	app.patch(prefix("orders/:order_id"), authenticateUser, changeOrder);

	app.post(prefix("users/me/activate"), authenticateUser, activateUser);
	app.get(prefix("users/exists"), authenticateUser, userExists);
	app.get(prefix("users/me"), authenticateUser, v1MyUserInfo);
	app.get(prefix("users/:user_id"), authenticateUser, v1UserInfo);

	app.patch(prefix("users/"), authenticateUser, updateUser); // deprecated, use users/me
	app.patch(prefix("users/me"), authenticateUser, updateUser);
	app.delete(prefix("users/me/session"), authenticateUser, logoutUser);
	app.post(prefix("users/"), v1SignInUser); // this is different than the new version

	app.get(prefix("config/"), getConfigHandler);
	app.get("/status", statusHandler);
}
