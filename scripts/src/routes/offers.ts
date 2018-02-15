import { Router } from "express";

import { getOffers } from "../services/offers";
import { createOrder } from "../services/orders";

export const router: Router = Router();

/**
 * Return a list of offers
 */
router.get("/", async (req, res, next) => {
	const data = await getOffers({});
	res.status(200).send(data);
});

/**
 * create an order for an offer
 */
router.post("/:offer_id/orders", async (req, res, next) => {
	const order = createOrder(req.params.offer_id);
	res.status(201).send(order);
});
