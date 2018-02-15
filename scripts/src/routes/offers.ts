import { Router } from "express";

import { getOffers, OfferList } from "../services/offers";
import { createOrder, OpenOrder } from "../services/orders";

export const router: Router = Router();

/**
 * Return a list of offers
 */
router.get("/", async (req, res, next) => {
	const data: OfferList = await getOffers({});
	res.status(200).send(data);
});

/**
 * create an order for an offer
 */
router.post("/:offer_id/orders", async (req, res, next) => {
	const order: OpenOrder = await createOrder(req.params.offer_id);
	res.status(201).send(order);
});
