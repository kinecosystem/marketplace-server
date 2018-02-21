import { Request, Router } from "express";
import { Context } from "../middleware";
import { getOffers, OfferList } from "../services/offers";
import { createOrder, OpenOrder } from "../services/orders";

export const router: Router = Router();

/**
 * Return a list of offers
 */
router.get("/", async (req: Request & {context: Context}, res, next) => {
	// // return all offers that are still within global cap and user cap are not expired
	// offers = Offers.find({expiration > now() && cap > used)
	// user_offers = []
	// for offer in offers:
	//   if len(OpenOrder.find({offerId} && not userId)) + offer.used >= offer.cap
	//   or len(Transaction.find({offerId, userId})) >= offer.user_cap:
	//     user_offers += offer
	// return user_offers
	try {
		const data: OfferList = await getOffers(req.context.user.id, req.context.user.appId);
		res.status(200).send(data);
	} catch (err) {
		next(err);
	}
});

/**
 * create an order for an offer
 */
router.post("/:offer_id/orders", async (req: Request & {context: Context}, res, next) => {
	/**
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
	const order: OpenOrder = await createOrder(req.params.offer_id, req.context.user.id);
	res.status(201).send(order);
});
