import moment = require("moment");
import { LoggerInstance } from "winston";

import * as db from "../../models/orders";
import * as offerDb from "../../models/offers";
import { generateId, IdPrefix } from "../../utils";

import { Paging } from "./index";
import * as offerContents from "./offer_contents";
import * as payment from "./payment";
import { AssetValue } from "../../models/offers";
import { FailureReason } from "../../models/orders";

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
	result?: AssetValue | FailureReason;
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
	const order = await db.Order.findOneById(orderId);
	if (!order) {
		throw Error(`no such order ${orderId}`); // XXX throw and exception that is convert-able to json
	}
	return orderDbToApi(order, logger);
}

const openOrdersDB = new Map<string, db.OpenOrder>();
const expirationMin = 10; // 10 minutes
const graceMin = 10; // 10 minutes

function orderDbToApi(order: db.Order, logger: LoggerInstance): Order {
	return {
		status: order.status,
		result: order.value,
		id: order.id,
		completion_date: (order.completionDate || order.createdDate).toISOString(), // XXX should we separate the dates?
		blockchain_data: order.blockchainData,
		offer_type: order.type,
		title: order.meta.title,
		description: order.meta.description,
		call_to_action: order.meta.call_to_action,
		content: order.meta.content,
		amount: order.amount,
	};
}

export async function createOrder(
	offerId: string, userId: string, logger: LoggerInstance): Promise<OpenOrder> {
	// offer cap logic

	const openOrder: db.OpenOrder = {
		expiration: moment().add(expirationMin, "minutes").toDate(),
		id: generateId(IdPrefix.Transaction),
		offerId,
		userId
	};

	openOrdersDB.set(openOrder.id, openOrder);

	return {
		id: openOrder.id,
		expiration_date: openOrder.expiration.toISOString(),
	};
}

export async function submitOrder(
	orderId: string, form: string | undefined, walletAddress: string, appId: string, logger: LoggerInstance): Promise<Order> {

	// validate order
	const openOrder: db.OpenOrder = openOrdersDB.get(orderId);
	if (!openOrder) {
		throw Error(`no such order ${orderId}`);
	}
	if (new Date() > openOrder.expiration) {
		throw Error(`order ${orderId} expired`);
	}

	const offer = await offerDb.Offer.findOneById(openOrder.offerId);

	if (offer.type === "earn") {
		// validate form
		if (!await offerContents.isValid(offer.id, form, logger)) {
			throw Error(`submitted form is invalid for ${openOrder.id}`);
		}
	}

	// transition open order to pending order
	const order = new db.Order(openOrder, offer);
	offer.cap.used += 1;
	await offer.save();
	await order.save();
	openOrdersDB.delete(orderId);

	// pay or start timer for payment
	if (offer.type === "earn") {
		await payment.payTo(walletAddress, appId, offer.amount, order.id, logger);
	} else {
		await submitSpend(order, offer, walletAddress, appId, logger);
	}

	return orderDbToApi(order, logger);
}

export async function submitSpend(
	order: db.Order, offer: offerDb.Offer, walletAddress: string, appId: string, logger: LoggerInstance): Promise<void> {
	async function makeFailed(orderId: string) {
		// XXX lock on order.id
		const order = await db.Order.findOneById(orderId);
		order.status = "failed";
		const offer = await offerDb.Offer.findOneById(order.offerId);
		offer.cap.used -= 1;
		await offer.save();
		await order.save();
	}

	// start a timer for order.expiration + grace till this order becomes failed
	// setTimeout(makeFailed, order.expiration, order.id);
	return;
}

export async function cancelOrder(orderId: string, logger: LoggerInstance): Promise<void> {
	// you can only delete an open order - not a pending order
	// validate order
	const openOrder: db.OpenOrder = openOrdersDB.get(orderId);
	if (!openOrder) {
		throw Error(`no such order ${orderId}`);
	}
	openOrdersDB.delete(orderId);
}

export async function getOrderHistory(
	userId: string,
	logger: LoggerInstance,
	limit: number = 25,
	before?: string, after?: string): Promise<OrderList> {

	// XXX use the cursor input values
	const orders: db.Order[] = await db.Order.find({ where: { userId }, order: { createdDate: "DESC" }, take: limit });

	return {
		orders: orders.map(order => {
			return orderDbToApi(order, logger);
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
