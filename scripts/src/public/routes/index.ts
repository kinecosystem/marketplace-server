import * as express from "express";

import * as db from "../../models/users";
import { TOSMissingOrOldToken } from "../../errors";

import { authenticate } from "../auth";
import { statusHandler } from "../middleware";

import { getOffers } from "./offers";
import { getConfigHandler } from "./config";
import { signInUser, userInfo, myUserInfo, userExists, activateUser, updateUser } from "./users";
import {
	getOrder,
	cancelOrder,
	getOrderHistory,
	submitOrder,
	changeOrder,
	createMarketplaceOrder,
	createExternalOrder
} from "./orders";
import { authenticateUser } from "../../../bin/public/auth";

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

type ExtendedRouter = express.Router & {
	authenticated(...scopes: AuthScopes[]): express.Router;
};

function proxyOverRouter(router: express.Router, proxy: ExtendedRouter, obj: any): typeof obj {
	if (typeof obj === "function") {
		return function(...args: any[]) {
			const result = obj(...args);
			// const result = obj.apply(null, args);
			return result === router ? proxy : result;
		};
	}

	return obj === router ? proxy : obj;
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

	app.patch(prefix("users/"), authenticateUser, updateUser);
	app.post(prefix("users/"), signInUser);

	app.get(prefix("config/"), getConfigHandler);
	app.get("/status", statusHandler);
}
