import { Router } from "express";

import { createOrder, getOffers } from "../services/offers";

export const router: Router = Router();

/**
 * Return a list of offers
 */
router.get("/", async (req, res, next) => {
	const options = {
	};

	try {
		const result = await getOffers(options);
		res.status(result.code || 200).send(result.data);
	} catch (err) {
		return res.status(500).send({
			error: "Server Error",
			status: 500,
		});
	}
});

/**
 * create an order for an offer
 */
router.post("/:offer_id/order", async (req, res, next) => {
	const options = {
	};

	try {
		const result = await createOrder(options);
		res.status(result.code || 200).send(result.data);
	} catch (err) {
		return res.status(err.status).send({
			error: err.error,
			status: err.status,
		});
	}
});
