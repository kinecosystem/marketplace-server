import { Request, Response } from "express";

import {
	CompletedPayment,
	paymentComplete as paymentCompleteService,
	paymentFailed as paymentFailedService,
} from "../services/internal";

export async function paymentComplete(req: Request, res) {
	await paymentCompleteService(req.body as CompletedPayment, req.logger);
	res.status(200).send({ status: "ok" });
}

export async function paymentFailed(req: Request, res: Response) {
	await paymentFailedService(req.body as CompletedPayment, req.query.reason, req.logger);
	res.status(200).send({ status: "ok" });
}
