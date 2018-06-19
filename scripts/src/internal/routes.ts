import { Request, Response, Router, Express, RequestHandler } from "express";

import {
	CompletedPayment,
	paymentFailed as paymentFailedService,
	paymentComplete as paymentCompleteService,
	walletCreationFailure as walletCreationFailureService,
	walletCreationSuccess as walletCreationSuccessService,
	WalletCreationSuccessData,
	WalletCreationFailureData, FailedPayment,
} from "./services";

import { statusHandler } from "./middleware";

export type WebHookRequestPayload = {
	object: "wallet" | "payment";
	state: "success" | "fail";
};

export type WalletRequest = WebHookRequestPayload & {
	object: "wallet";
	action: "create";
} & ({
	value: WalletCreationSuccessData;
	state: "success";
} |
	{
		value: WalletCreationFailureData;
		state: "fail";
	});

export type PaymentRequest = WebHookRequestPayload & {
	object: "payment";
	action: "send" | "receive";
} & ({
	value: CompletedPayment;
	state: "success";
} |
	{
		value: FailedPayment;
		state: "fail";
	});

export type WebHookRequest<T = any> = Request & {
	body: WalletRequest | PaymentRequest;
};

export const webhookHandler = async function(req: WebHookRequest, res: Response) {
	const body: WalletRequest | PaymentRequest = req.body;
	if (body.object === "payment") {
		if (body.action === "send" || body.action === "receive") {
			if (body.state === "success") {
				await paymentCompleteService(body.value, req.logger);
			} else {
				await paymentFailedService(body.value, req.logger);
			}
		} else {
			req.logger.error(`unknown action ("${ (body as any).action }" for payment webhook)`);
			res.status(400).send({ status: "error", error: "what?" });
		}
	} else if (body.object === "wallet") {
		if (body.action === "create") {
			if (body.state === "success") {
				await walletCreationSuccessService(body.value, req.logger);
			} else {
				await walletCreationFailureService(body.value, req.logger);
			}
		} else {
			req.logger.error(`unknown action ("${ (body as any).action }" for wallet webhook)`);
			res.status(400).send({ status: "error", error: "what?" });
		}
	} else {
		req.logger.error(`unknown object ("${ (body as any).object }" for webhooks)`);
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
	await paymentFailedService(req.body as FailedPayment, req.logger);
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
