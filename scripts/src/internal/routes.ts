import { Request, Response, Router, Express, RequestHandler } from "express";

import {
	CompletedPayment,
	paymentComplete as paymentCompleteService,
	paymentFailed as paymentFailedService,
} from "./services";

import { statusHandler } from "./middleware";

export const paymentComplete = async function(req: Request, res: Response) {
	await paymentCompleteService(req.body as CompletedPayment, req.logger);
	res.status(200).send({ status: "ok" });
} as any as RequestHandler;

export const paymentFailed = async function(req: Request, res: Response) {
	await paymentFailedService(req.body as CompletedPayment, req.query.reason, req.logger);
	res.status(200).send({ status: "ok" });
} as any as RequestHandler;

export function createRoutes(app: Express, pathPrefix?: string) {
	const router = Router();
	router
		.post("/payments", paymentComplete)
		.post("/failed-payments", paymentFailed);

	app.use("/v1/internal/", router);
	app.get("/status", statusHandler);
}
