import { Router } from "express";

import { cancelOrder, submitOrder } from "../services/orders";

export const router: Router = Router();

/**
 * cancel an order
 */
router.delete("/:order_id", async (req, res, next) => {
	const options = {};

	try {
		const result = await cancelOrder(options);
		res.status(result.code || 200).send(result.data);
	} catch (err) {
		return res.status(500).send({
			error: "Server Error",
			status: 500,
		});
	}
});

/**
 * submit an order
 */
router.post("/:order_id", async (req, res, next) => {
	const options = {};

	try {
		const result = await submitOrder(options);
		res.status(result.code || 200).send(result.data);
	} catch (err) {
		return res.status(500).send({
			error: "Server Error",
			status: 500,
		});
	}
});
