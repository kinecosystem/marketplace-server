import * as express from "express";

import * as db from "../../models/users";
import { statusHandler } from "../middleware";

import { getOffers } from "./offers";
import { getConfigHandler } from "./config";
import {
	userInfo,
	myUserInfo,
	signInUser,
	updateUser,
	userExists,
	logoutUser,
	activateUser,
	oldVersionSignInUser
} from "./users";
import {
	cancelOrder,
	changeOrder,
	createExternalOrder,
	createMarketplaceOrder,
	getOrder,
	getOrderHistory,
	submitOrder
} from "./orders";
import { authenticateUser } from "../auth";

export type Context = {
	user: db.User | undefined;
	token: db.AuthToken | undefined;
};

// augment the express request object
declare module "express" {
	interface Request {
		token: string;
		context: Context;
	}
}

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
	app.get("/status", statusHandler);
}

export function createOldVersionRoutes(app: express.Express, pathPrefix?: string) {
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

	app.patch(prefix("users/"), authenticateUser, updateUser); // deprecated, use users/me
	app.patch(prefix("users/me"), authenticateUser, updateUser);
	app.delete(prefix("users/me/session"), authenticateUser, logoutUser);
	app.post(prefix("users/"), oldVersionSignInUser); // this is different than the new version

	app.get(prefix("config/"), getConfigHandler);
	app.get("/status", statusHandler);
}
