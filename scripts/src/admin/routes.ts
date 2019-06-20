import * as path from "path";
import * as fs from "fs";
import { promisify } from "util";

import { Express, Request, RequestHandler, Response, Router } from "express";
import { getDefaultLogger as logger } from "../logging";

import {
	addMigrationUser,
	changeAppOffer,
	changeOffer,
	fuzzySearch,
	getApplication,
	getApplicationOffers,
	getApplications,
	getApplicationUserData,
	getApplicationUsers, getMigrationStatus,
	getOffer,
	getOffers,
	getOrder,
	getOrders,
	getPollResults,
	getUserData,
	getUserOffers,
	getWallet,
	getWalletPayments,
	retryOrder,
	retryUserWallet,
	updateAppConfig
} from "./services";

import { statusHandler } from "../middleware";
import { getConfig } from "./config";

const readFile = promisify(fs.readFile);

function jsonResponse(func: (body: any, params: any, query: any) => Promise<string>): RequestHandler {
	return async function(req: Request, res: Response) {
		const content = await func(req.body, req.params, req.query);
		res.status(200).json(content);
	} as any as RequestHandler;
}

function wrapService(func: (params: any, query: any) => Promise<string>): RequestHandler {
	const genericServiceTemplatePath = "../../src/admin/wrapper.html";
	return async function(req: Request, res: Response) {
		const content = await func(req.params, req.query);
		const html = (await readFile(path.join(__dirname, genericServiceTemplatePath), { encoding: "utf8" }))
			.replace("${ content }", content)
			.replace("${ webview }", getConfig().webview)
			.replace("${ now }", Date.now().toString())
			.replace(/\$isProduction\$/g, (process.env.environment_name === "production").toString());

		res.status(200).send(html);
	} as any as RequestHandler;
}

export async function index(params: { app_id: string }, query: any): Promise<string> {
	return `<ul>
<li><a href="/applications">/applications</a></li>
<li><a href="/offers">/offers</a></li>
<li><a href="/orders">/orders</a></li>
<li><a href="/fuzzy">/fuzzy</a></li>
</ul>`;
}

export function createRoutes(app: Express, pathPrefix?: string) {
	const router = Router();
	router
		.get("/applications", wrapService(getApplications))
		.get("/applications/:app_id", wrapService(getApplication))
		.get("/applications/:app_id/offers", wrapService(getApplicationOffers))
		.get("/applications/:app_id/users", wrapService(getApplicationUsers))
		.get("/offers", wrapService(getOffers))
		.get("/orders", wrapService(getOrders))
		.get("/offers/:offer_id", wrapService(getOffer))
		.get("/polls/:offer_id", wrapService(getPollResults))
		.get("/users/:user_id", wrapService(getUserData))
		.get("/users/:user_id/offers", wrapService(getUserOffers))
		.get("/applications/:app_id/users/:app_user_id", wrapService(getApplicationUserData))
		.get("/orders/:order_id", wrapService(getOrder))
		.get("/fuzzy/:some_id", wrapService(fuzzySearch))
		.get("/wallets/:wallet_address", wrapService(getWallet))
		.get("/wallets/:wallet_address/payments", wrapService(getWalletPayments))
		.get("/", wrapService(index))
		// retries
		.get("/orders/:order_id/retry", wrapService(retryOrder))
		.get("/users/:user_id/wallets/:wallet/retry", wrapService(retryUserWallet))
		// change data
		.post("/applications/:app_id/offers/:offer_id", jsonResponse(changeAppOffer))
		.post("/offers/:offer_id", jsonResponse(changeOffer))

		.put("/applications/:application_id/config", updateAppConfig)
		.post("/migration/users", jsonResponse(addMigrationUser))
		.get("/migration/wallets/:wallet_address/status", jsonResponse(getMigrationStatus))

	;

	app.use("", router);
	app.get("/status", statusHandler);
	logger().info("created routes");
}
