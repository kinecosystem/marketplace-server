import { Request, Response, Router, Express, RequestHandler } from "express";

import {
	CompletedPayment,
	paymentComplete as paymentCompleteService,
	paymentFailed as paymentFailedService,
} from "./services";

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

	app.use(createPath("/", pathPrefix), router.post("/payments"), paymentComplete);
	app.use(createPath("/", pathPrefix), router.post("/failed-payments"), paymentFailed);
}

function createPath(path: string, prefix?: string): string {
	if (!prefix) {
		return path;
	}

	return `${ prefix }/${ path }`;
}
