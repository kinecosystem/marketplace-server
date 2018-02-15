import { Router } from "express";

import { cancelOrder, getOrder, getOrderHistory, OpenOrder, Order, OrderList, submitOrder } from "../services/orders";

export const router: Router = Router();

/**
 * get an order
 */
router.get("/:order_id", async (req, res, next) => {
	const order: Order = await getOrder("Tkjhds8s9d7fsdf1");
	res.status(200).send(order);
});

/**
 * submit an order
 */
router.post("/:order_id", async (req, res, next) => {
	await submitOrder({});
	res.status(201).send();

});

/**
 * cancel an order
 */
router.delete("/:order_id", async (req, res, next) => {
	await cancelOrder({});
	res.status(204).send();
});

/**
 * get user history
 */
router.get("/", async (req, res, next) => {
	const orderList: OrderList = await getOrderHistory();
	res.status(200).send(orderList);
});
