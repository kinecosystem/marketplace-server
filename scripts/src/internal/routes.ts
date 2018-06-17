import { Request, Response, Router, Express, RequestHandler } from "express";

import {
	CompletedPayment,
	paymentFailed as paymentFailedService,
	paymentComplete as paymentCompleteService,
	walletCreationFailure as walletCreationFailureService,
	walletCreationSuccess as walletCreationSuccessService,
	WalletCreationSuccessData,
	WalletCreationFailureData,
} from "./services";

import { statusHandler } from "./middleware";

export type WebHookRequestPayload = {
	object: "wallet" | "payment";
	state: "success" | "fail";
};

export type WalletRequest<T> = T & WebHookRequestPayload & {
	object: "wallet";
	action: "creation";
};

export type PaymentRequest<T> = T & WebHookRequestPayload & {
	object: "payment";
	action: "sent" | "received";
};

export type WebHookRequest<T = any> = Request & {
	body: WalletRequest<T> | PaymentRequest<T>;
};

export const webhookHandler = async function(req: WebHookRequest, res: Response) {
	if (req.body.object === "payment") {
		if (req.body.state === "success") {
			await paymentCompleteService(req.body as CompletedPayment, req.logger);
		} else {
			await paymentFailedService(req.body as CompletedPayment, req.body.reason, req.logger);
		}
	} else if (req.body.object === "wallet") {
		if (req.body.action === "creation") {
			if (req.body.state === "success") {
				await walletCreationSuccessService(req.body as WalletCreationSuccessData);
			} else {
				await walletCreationFailureService(req.body as WalletCreationFailureData);
			}
		} else {
			req.logger.error(`unknown action ("${ req.body.action }" for wallet webhook)`);
			res.status(400).send({ status: "error", error: "what?" });
		}
	} else {
		req.logger.error(`unknown object ("${ req.body.object }" for webhooks)`);
		res.status(400).send({ status: "error", error: "what?" });
	}

	res.status(200).send({ status: "ok" });
} as any as RequestHandler;

/**
 * DEPRECATED
 * only here for backwards compatibility
 */
export const paymentComplete = async function(req: Request, res: Response) {
	await paymentCompleteService(req.body as CompletedPayment, req.logger);
	res.status(200).send({ status: "ok" });
} as any as RequestHandler;

/**
 * DEPRECATED
 * only here for backwards compatibility
 */
export const paymentFailed = async function(req: Request, res: Response) {
	await paymentFailedService(req.body as CompletedPayment, req.query.reason, req.logger);
	res.status(200).send({ status: "ok" });
} as any as RequestHandler;

export function createRoutes(app: Express, pathPrefix?: string) {
	const router = Router();
	router
		.post("/webhook", webhookHandler)
		.post("/payments", paymentComplete) // deprecated
		.post("/failed-payments", paymentFailed); // deprecated

	app.use("/v1/internal/", router);
	app.get("/status", statusHandler);
}
