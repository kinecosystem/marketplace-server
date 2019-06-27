import { Request, RequestHandler, Response } from "express";
import { getDefaultLogger as logger } from "../../logging";

import { AuthenticatedRequest } from "../auth";
import { OfferTranslation } from "../../models/translations";
import { Application } from "../../models/applications";
import { NoSuchApp } from "../../errors";
import {
	Order,
	getOrder as getOrderService,
	cancelOrder as cancelOrderService,
	submitOrder as submitOrderService,
	changeOrder as changeOrderService,
	getOrderHistory as getOrderHistoryService,
	createExternalOrder as createExternalOrderService,
	createMarketplaceOrder as createMarketplaceOrderService,
	createCrossAppOrder as createCrossAppOrderService,
} from "../services/orders";
import { createExternalOrder as v1CreateExternalOrderService } from "../services/orders.v1";

export type CreateMarketplaceOrderRequest = AuthenticatedRequest & {
	params: {
		offer_id: string;
	}
};
export type OrderTranslations = {
	orderTitle: string;
	orderDescription: string;
};
/**
 * create an order for an offer
 */
export const createMarketplaceOrder = async function(req: CreateMarketplaceOrderRequest, res: Response) {
	const [availableLanguages, availableTranslations] = await OfferTranslation.getSupportedLanguages({
		languages: req.acceptsLanguages(),
		offerId: req.params.offer_id,
		paths: ["orderTitle", "orderDescription"],
	});
	const language = req.acceptsLanguages(availableLanguages); // get the most suitable language for the client
	const orderTranslations = availableTranslations.reduce((dict, translation) => {
		if (translation.language === language) {
			dict[translation.path as keyof OrderTranslations] = translation.translation;
		}
		return dict;
	}, {} as OrderTranslations);

	const order = await createMarketplaceOrderService(req.params.offer_id, req.context.user, req.context.token.deviceId, orderTranslations);
	res.status(201).send(order);
} as any as RequestHandler;

export type CreateExternalOrderRequest = AuthenticatedRequest & {
	body: {
		jwt: string;
	}
};
/**
 * create an order for a native offer
 */
export const v1CreateExternalOrder = async function(req: CreateExternalOrderRequest, res: Response) {
	const order = await v1CreateExternalOrderService(req.body.jwt, req.context.user);
	res.status(201).send(order);
} as any as RequestHandler;
export const createExternalOrder = async function(req: CreateExternalOrderRequest, res: Response) {
	const order = await createExternalOrderService(req.body.jwt, req.context.user, req.context.token.deviceId);
	res.status(201).send(order);
} as any as RequestHandler;

export type GetOrderRequest = AuthenticatedRequest & {
	params: {
		order_id: string;
	}
};
/**
 * get an order
 */
export const getOrder = async function(req: GetOrderRequest, res: Response) {
	const order = await getOrderService(req.params.order_id, req.context.user);
	res.status(200).send(order);
} as any as RequestHandler;

export type SubmitOrderRequest = AuthenticatedRequest & {
	params: {
		order_id: string;
	},
	body: {
		content: string;
		transaction?: string;
	}
};
/**
 * submit an order - this is the earn payload requesting validation
 *
 * check that order hasn't passed expiration + grace period
 */
export const submitOrder = async function(req: SubmitOrderRequest, res: Response) {
	logger().info("submit order", { userId: req.context.user.id, orderId: req.params.order_id });

	const order = await submitOrderService(
		req.params.order_id,
		req.context.user,
		req.context.token.deviceId,
		req.body.content,
		req.body.transaction);
	res.status(200).send(order);
} as any as RequestHandler;

/**
 * cancel an order
 */
export const cancelOrder = async function(req: GetOrderRequest, res: Response) {
	await cancelOrderService(req.params.order_id, req.context.user.id);
	res.status(204).send();
} as any as RequestHandler;

export type changeOrderRequest = AuthenticatedRequest & {
	params: {
		order_id: string;
	},
	body: Partial<Order>;
};
/**
 * change an order - add an error
 */
export const changeOrder = async function(req: changeOrderRequest, res: Response) {
	const order = await changeOrderService(req.params.order_id, req.context.user, req.body);
	res.status(200).send(order);
} as any as RequestHandler;

export type GetOrderHistoryRequest = AuthenticatedRequest & {
	query: {
		origin?: string;
		offer_id?: string;
	}
};

/**
 * get user history
 */
export const getOrderHistory = async function(req: GetOrderHistoryRequest, res: Response) {
	const filters = {
		origin: req.query.origin,
		offerId: req.query.offer_id || req.query.offerId // old clients send offerId instead of offer_id
	};
	const orderList = await getOrderHistoryService(req.context.user, req.context.token.deviceId, filters, req.query.limit);
	res.status(200).send(orderList);
} as any as RequestHandler;

export type CreateCrossAppOrderRequest = AuthenticatedRequest & {
	body: {
		wallet_address: string,
  	app_id: string,
  	title: string,
  	description: string,
  	amount: number
	}
};

export const createCrossAppOrder = async function(req: CreateCrossAppOrderRequest, res: Response) {
	const order = await createCrossAppOrderService(req.body.wallet_address, req.body.app_id, req.body.title, req.body.description, req.body.amount, req.context.user, req.context.token.deviceId);
	res.status(201).send(order);
} as any as RequestHandler;
