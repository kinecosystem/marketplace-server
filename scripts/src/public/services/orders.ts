import { LoggerInstance } from "winston";

import { lock } from "../../redis";
import * as metrics from "../../metrics";
import * as db from "../../models/orders";
import * as offerDb from "../../models/offers";
import { AssetValue } from "../../models/offers";

import { Paging } from "./index";
import * as payment from "./payment";
import * as offerContents from "./offer_contents";

const createOrderResourceId = "locks:orders:create";

export interface OrderList {
	orders: Order[];
	paging: Paging;
}

export interface OpenOrder {
	id: string;
	expiration_date: string;
}

export interface Order {
	id: string;
	offer_id: string;
	result?: AssetValue;
	error?: db.OrderError;
	content?: string; // json serialized payload of the coupon page
	status: db.OrderStatus;
	completion_date: string; // UTC ISO
	blockchain_data: offerDb.BlockchainData;
	offer_type: offerDb.OfferType;
	title: string;
	description: string;
	call_to_action?: string;
	amount: number;
}

export async function getOrder(orderId: string, logger: LoggerInstance): Promise<Order> {
	const order = await db.Order.getNonOpen(orderId);

	if (!order) {
		throw new Error(`no such order ${ orderId } or order is open`); // XXX throw and exception that is convert-able to json
	}
	logger.info("getOrder returning", { orderId, status: order.status, offerId: order.offerId, userId: order.userId });
	return orderDbToApi(order);
}

function orderDbToApi(order: db.Order): Order {
	if (order.status === "opened") {
		throw new Error("opened orders should not be returned");
	}

	return {
		id: order.id,
		offer_id: order.offerId,
		status: order.status,
		result: order.value,
		error: order.error,
		completion_date: (order.currentStatusDate || order.createdDate).toISOString(), // XXX should we separate the dates?
		blockchain_data: order.blockchainData!,
		offer_type: order.type,
		title: order.meta.title,
		description: order.meta.description,
		call_to_action: order.meta.call_to_action,
		content: order.meta.content,
		amount: order.amount,
	};
}

export async function createOrder(offerId: string, userId: string, logger: LoggerInstance): Promise<OpenOrder> {
	logger.info("creating order for", { offerId, userId });
	const offer = await offerDb.Offer.findOneById(offerId);
	if (!offer) {
		throw new Error(`cannot create order, offer ${ offerId } not found`);
	}

	let order = await db.Order.findOne({ where: {
			userId,
			offerId,
			status: "opened"
		}
	});

	if (!order) {
		const create = async () => {
			const total = await db.Order.count({
				where: {
					offerId
				}
			});

			if (total === offer.cap.total) {
				logger.info("total cap reached", { offerId, userId });
				return undefined;
			}

			const forUser = await db.Order.count({
				where: {
					userId,
					offerId
				}
			});

			if (forUser === offer.cap.per_user) {
				logger.info("per_user cap reached", { offerId, userId });
				return undefined;
			}

			const order = db.Order.new({
				userId,
				offerId,
				amount: offer.amount,
				type: offer.type,
				status: "opened",
				meta: offer.meta.order_meta
			});
			await order.save();
			return order;
		};

		// order = await lock(createOrderResourceId, create());
		order = await create();
	}

	if (!order) {
		throw new Error(`offer ${ offerId } cap reached`);
	}

	logger.info("created new open order", { offerId, userId, orderId: order.id });

	return {
		id: order.id,
		expiration_date: order.expirationDate!.toISOString(),
	};
}

export async function submitOrder(
	orderId: string, form: string | undefined, walletAddress: string, appId: string, logger: LoggerInstance): Promise<Order> {

	const order = await db.Order.findOne({ id: orderId, status: "opened" });
	if (!order) {
		throw Error(`no such open order ${ orderId }`);
	}
	if (new Date() > order.expirationDate!) {
		throw Error(`open order ${ orderId } has expired`);
	}

	const offer = await offerDb.Offer.findOneById(order.offerId);
	if (!offer) {
		throw Error(`no such offer ${ order.offerId }`);
	}
	if (offer.type === "earn") {
		// validate form
		if (!await offerContents.isValid(offer.id, form, logger)) {
			throw Error(`submitted form is invalid for ${ order.id }`);
		}
	}

	order.status = "pending";
	order.currentStatusDate = new Date();
	await order.save();
	logger.info("order changed to pending", { orderId });

	if (offer.type === "earn") {
		await payment.payTo(walletAddress, appId, offer.amount, order.id, logger);
	}

	metrics.submitOrder(offer.type, offer.id);
	return orderDbToApi(order);
}

export async function cancelOrder(orderId: string, logger: LoggerInstance): Promise<void> {
	// you can only delete an open order - not a pending order
	const order = await db.Order.getNonOpen(orderId);
	if (!order) {
		throw Error(`no such open order ${ orderId }`);
	}

	await order.remove();
}

export async function getOrderHistory(
	userId: string,
	logger: LoggerInstance,
	limit: number = 25,
	before?: string,
	after?: string): Promise<OrderList> {

	// XXX use the cursor input values
	const orders: db.Order[] = await db.Order.getAllNonOpen(userId, limit);

	return {
		orders: orders.map(order => {
			return orderDbToApi(order);
		}),
		paging: {
			cursors: {
				after: "MTAxNTExOTQ1MjAwNzI5NDE",
				before: "NDMyNzQyODI3OTQw",
			},
			previous: "https://api.kinmarketplace.com/v1/orders?limit=25&before=NDMyNzQyODI3OTQw",
			next: "https://api.kinmarketplace.com/v1/orders?limit=25&after=MTAxNTExOTQ1MjAwNzI5NDE=",
		},
	};
}
