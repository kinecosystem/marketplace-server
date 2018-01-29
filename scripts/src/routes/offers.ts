import { Router } from "express";
import { getOffers, createOrder } from "../services/offers";

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
			status: 500,
			error: "Server Error"
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
			status: err.status,
			error: err.error
		});
	}
});
