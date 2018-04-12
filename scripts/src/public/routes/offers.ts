import { Request, Response, NextFunction, RequestHandler } from "express";

import { OfferType } from "../../models/offers";

import { getOffers as getOffersService } from "../services/offers";
import { createMarketplaceOrder as createMarketplaceOrderService } from "../services/orders";

/**
 * Return a list of offers
 */
export type GetOffersRequest = Request & {
	query: {
		type: OfferType
	}
};
export const getOffers = async function(req: GetOffersRequest, res: Response, next: NextFunction) {
	try {
		const data = await getOffersService(req.context.user!.id, req.context.user!.appId, req.query, req.logger);
		res.status(200).send(data);
	} catch (err) {
		next(err);
	}
} as RequestHandler;

/**
 * create an order for an offer
 *
 * with GlobalLock(req.context.userId + req.context.offerId):
 *   // did the transaction
 *   existing_transactions = Transaction.find({offerId, userId})
 *   offer = Offer.findOneById(offerId)
 *   if len(existing_transactions) >= offer.user_cap:
 *     throw NoCapLeft("for user")
 *   existing_order = OpenOrder.find({userId: userId, offerId: offerId})
 *   if existing_order && !existing_order.is_expired():
 *     return existing_order
 *   // no existing order:
 *   locked_cap = len(OpenOrders.find({offerId}))
 *   left_cap = offer.cap - offer.used - locked_cap
 *   if not left_cap:
 *     throw NoCapLeft("depleted resource")
 *   // create a new order
 *   order = OpenOrders.create(offerId, userId) // this adds to the locked_cap
 *   return order
 */
export const createMarketplaceOrder = async function(req: Request, res: Response) {
	const order = await createMarketplaceOrderService(req.params.offer_id, req.context.user!.id, req.logger);
	res.status(201).send(order);
} as any as RequestHandler;
