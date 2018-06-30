import { Request, Response, Router, Express, RequestHandler } from "express";
import { getDefaultLogger } from "../logging";

import {
	getApplications, getApplication, getOffers,
	getOffer, getPollResults, getAllOfferStats,
	getUserData, getApplicationUserData, getOrder,
	getApplicationUsers, getOfferStats,
	getOrders, fuzzySearch, getWallet, getWalletPayments,
	getApplicationOffers, getUserOffers,
	retryOrder, retryUserWallet, getApplicationStats
} from "./services";

import { statusHandler } from "../middleware";

function wrapService(func: (params: any, query: any) => Promise<string>): RequestHandler {
	return async function(req: Request, res: Response) {
		const content = await func(req.params, req.query);
		const html = `
<html>
	<head>
		<title>Marketplace Admin</title>
		<style>
		body {
			font-family: Arial;
			background: #ffffff;
		}
		td {
			vertical-align: bottom;
		}
		tr:nth-child(even) {background: #FFFFFF}
		tr:nth-child(odd) {background: #FFEEEE}
		img {
			height: 50px;
		}
		pre {
			font-family: "Courier New";
			background: #eeeeee;
			padding: 5px;
			width: 250px;
			overflow: scroll;
		}
		.alert {
			color: red;
		}
		.wide {
			width: 1250px;
		}
		.status_completed a {
			color: green;
			font-weight: bold;
		}
		.status_failed a {
			color: red;
			font-weight: bold;
		}
		.status_pending a {
			color: yellow;
			font-weight: bold;
		}
		.status_opened a {
			color: purple;
			font-weight: bold;
		}
		</style>
	</head>
	<body>
		<h1><a href="/">Marketplace Admin</a></h1>
		<div id="content">${content}</div>
	</body>
</html>`;
		res.status(200).send(html);
	} as any as RequestHandler;
}

export async function index(params: { app_id: string }, query: any): Promise<string> {
	return `<ul>
<li><a href="/applications">/applications</a></li>
<li><a href="/offers">/offers</a></li>
<li><a href="/orders">/orders</a></li>
<li><a href="/offers/stats">/offers/stats</a></li>
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
		.get("/applications/:app_id/stats", wrapService(getApplicationStats))
		.get("/offers", wrapService(getOffers))
		.get("/orders", wrapService(getOrders))
		.get("/offers/stats", wrapService(getAllOfferStats))
		.get("/offers/:offer_id", wrapService(getOffer))
		.get("/offers/:offer_id/stats", wrapService(getOfferStats))
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
		.get("/users/:user_id/retry", wrapService(retryUserWallet));

	app.use("", router);
	app.get("/status", statusHandler);
	getDefaultLogger().info("created routes");
}
