import { Request, Response, Router, Express, RequestHandler } from "express";
import { getDefaultLogger } from "../logging";

import {
	getApplications, getApplcation, getOffers,
	getOffer, getPollResults, getOfferStats,
	getUserData, getApplicationUserData, getOrder,
	fuzzySearch
} from "./services";

import { statusHandler } from "../middleware";

function wrapService(func: (params: any, query: any) => Promise<string>): RequestHandler {
	return async function(req: Request, res: Response) {
		const content = await func(req.params, req.query);
		const html = `
<html>
<head><title>Marketplace Admin</title></head>
<body>
<h1>Marketplace Admin</h1>
<div id="content">${content}</div>
</body>
</html>`
		res.status(200).send(html);
	} as any as RequestHandler;
}

export function createRoutes(app: Express, pathPrefix?: string) {
	const router = Router();
	router
		.get("/applications", wrapService(getApplications))
		.get("/applications/:app_id", wrapService(getApplcation))
		.get("/offers", wrapService(getOffers))
		.get("/offers/:offer_id", wrapService(getOffer))
		.get("/polls/:offer_id", wrapService(getPollResults))
		.get("/offers/:offer_id/stats", wrapService(getOfferStats))
		.get("/users/:user_id", wrapService(getUserData))
		.get("/applications/:app_id/users/:app_user_id", wrapService(getApplicationUserData))
		.get("/orders/:order_id", wrapService(getOrder))
		.get("/fuzzy/:some_id", wrapService(fuzzySearch));

	app.use("/v1/admin", router);
	app.get("/status", statusHandler);
	getDefaultLogger().info("created routes");
}
