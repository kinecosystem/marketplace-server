import { Request, RequestHandler, Response } from "express";

import {
	Order,
	getOrder as getOrderService,
	cancelOrder as cancelOrderService,
	submitOrder as submitOrderService,
	changeOrder as changeOrderService,
	getOrderHistory as getOrderHistoryService,
	createExternalOrder as createExternalOrderService,
	createMarketplaceOrder as createMarketplaceOrderService,
} from "../services/orders";

export type CreateMarketplaceOrderRequest = Request & {
	params: {
		offer_id: string;
	}
};
/**
 * create an order for an offer
 */
export const createMarketplaceOrder = async function(req: CreateMarketplaceOrderRequest, res: Response) {
	const order = await createMarketplaceOrderService(req.params.offer_id, req.context.user!, req.logger);
	res.status(201).send(order);
} as any as RequestHandler;

export type CreateExternalOrderRequest = Request & {
	body: {
		jwt: string;
	}
};
/**
 * create an order for a native offer
 */
export const createExternalOrder = async function(req: CreateExternalOrderRequest, res: Response) {
	const order = await createExternalOrderService(req.body.jwt, req.context.user!, req.logger);
	res.status(201).send(order);
} as any as RequestHandler;

export type getOrderRequest = Request & {
	params: {
		order_id: string;
	}
};
/**
 * get an order
 */
export const getOrder = async function(req: getOrderRequest, res: Response) {
	const order = await getOrderService(req.params.order_id, req.logger);
	res.status(200).send(order);
} as any as RequestHandler;

export type submitOrderRequest = Request & {
	params: {
		order_id: string;
	},
	body: {
		content: string;
	}
};
/**
 * submit an order - this is the earn payload requesting validation
 *
 * check that order hasn't passed expiration + grace period
 */
export const submitOrder = async function(req: submitOrderRequest, res: Response) {
	req.logger.info("submit order", { userId: req.context.user!.id, orderId: req.params.order_id });

	const order = await submitOrderService(
		req.params.order_id,
		req.body.content,
		req.context.user!.walletAddress,
		req.context.user!.appId,
		req.logger);
	res.status(200).send(order);
} as any as RequestHandler;

/**
 * cancel an order
 */
export const cancelOrder = async function(req: getOrderRequest, res: Response) {
	await cancelOrderService(req.params.order_id, req.logger);
	res.status(204).send();
} as any as RequestHandler;

export type changeOrderRequest = Request & {
	params: {
		order_id: string;
	},
	body: Partial<Order>;
};
/**
 * change an order - add an error
 */
export const changeOrder = async function(req: changeOrderRequest, res: Response) {
	const order = await changeOrderService(req.params.order_id, req.body, req.logger);
	res.status(200).send(order);
} as any as RequestHandler;

export type GetOrderHistoryRequest = Request & {
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
		offerId: req.query.offer_id
	};
	const orderList = await getOrderHistoryService(req.context.user!.id, filters, req.logger);
	res.status(200).send(orderList);
} as any as RequestHandler;
