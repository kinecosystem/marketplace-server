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
import { getDefaultLogger as log } from "../logging";

import { statusHandler } from "./middleware";
import { PUBLIC_KEYS } from "./jwt";

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
				await paymentCompleteService(body.value);
			} else {
				await paymentFailedService(body.value);
			}
		} else {
			log().error(`unknown action ("${ (body as any).action }" for payment webhook)`);
			res.status(400).send({ status: "error", error: "what?" });
		}
	} else if (body.object === "wallet") {
		if (body.action === "create") {
			if (body.state === "success") {
				await walletCreationSuccessService(body.value);
			} else {
				await walletCreationFailureService(body.value);
			}
		} else {
			log().error(`unknown action ("${ (body as any).action }" for wallet webhook)`);
			res.status(400).send({ status: "error", error: "what?" });
		}
	} else {
		log().error(`unknown object ("${ (body as any).object }" for webhooks)`);
		res.status(400).send({ status: "error", error: "what?" });
	}

	res.status(200).send({ status: "ok" });
} as any as RequestHandler;

export const getJwtKeys = async function(req: WebHookRequest, res: Response) {
	res.status(200).send(PUBLIC_KEYS);
} as any as RequestHandler;

export function createRoutes(app: Express, pathPrefix?: string) {
	const router = Router();
	router
		.post("/webhook", webhookHandler)
		.get("/jwt-keys", getJwtKeys);

	app.use("/v1/internal/", router);
	app.get("/status", statusHandler);
}
