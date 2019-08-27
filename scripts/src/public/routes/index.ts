import * as express from "express";

import { statusHandler } from "../middleware";

import { getOffers } from "./offers";
import {
	getConfigHandler,
	getAppBlockchainVersion,
	setAppBlockchainVersion,
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
	v1MyUserInfo, bulkUserCreation,
} from "./users";
import {
	cancelOrder,
	changeOrder,
	createExternalOrder,
	v1CreateExternalOrder,
	createMarketplaceOrder,
	createOutgoingTransferOrder,
	createIncomingTransferOrder,
	getOrder,
	getOrderHistory,
	submitOrder,
} from "./orders";
import { authenticateUser } from "../auth";
import { accountStatus, addGradualMigrationUsers } from "../services/migration";

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

	app.post(prefix("transfers/outgoing/orders"), authenticateUser, createOutgoingTransferOrder);
	app.post(prefix("transfers/incoming/orders"), authenticateUser, createIncomingTransferOrder);

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

	app.get(prefix("applications/:app_id/blockchain_version"), authenticateUser, getAppBlockchainVersion);
	if (process.env.environment_name !== "production") {
		app.put(prefix("applications/:app_id/blockchain_version"), setAppBlockchainVersion);
	}
	app.post(prefix("applications/:app_id/migration/users"), addGradualMigrationUsers);
	app.get(prefix("migration/info/:app_id/:public_address"), accountStatus);

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
}

export function createPublicFacing(app: express.Express, pathPrefix?: string) {
	function prefix(path: string): string {
		if (!pathPrefix) {
			return path;
		}
		return `${ pathPrefix }/${ path }`;
	}

	app.post(prefix("users/bulk"), bulkUserCreation);
}
