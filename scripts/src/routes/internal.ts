import { Request, Response } from "express";

import { getLogger } from "../logging";
import {
	CompletedPayment,
	paymentComplete as paymentCompleteService,
	paymentFailed as paymentFailedService,
} from "../services/internal";

const logger = getLogger();

export async function paymentComplete(req: Request, res) {
	await paymentCompleteService(req.body as CompletedPayment);
	res.status(200).send({ status: "ok" });
}

export async function paymentFailed(req: Request, res: Response) {
	await paymentFailedService(req.body as CompletedPayment, req.query.reason);
	res.status(200).send({ status: "ok" });
}
