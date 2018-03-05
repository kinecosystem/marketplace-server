import { Paging } from "./index";
import * as offerDb from "../models/offers";
import * as db from "../models/orders";
import { generateId, IdPrefix } from "../utils";
import { getLogger } from "../logging";
import * as offerContents from "./offer_contents";
import * as payment from "./payment";
import moment = require("moment");

const logger = getLogger();

export interface OrderList {
	orders: Order[];
	paging: Paging;
}

export interface BlockchainData {
	transaction_id?: string;
	sender_address?: string;
	recipient_address?: string;
}

export interface OrderResult {
	coupon_code?: string;
	failure_message?: string;
}

export interface OpenOrder {
	id: string;
	blockchain_data?: BlockchainData;
	expiration_date: string;
}

export interface Order {
	id: string;
	result?: OrderResult;
	status: db.OrderStatus;
	completion_date: string; // UTC ISO
	blockchain_data: BlockchainData;
	offer_type: offerDb.OfferType;
	title: string;
	description: string;
	call_to_action?: string;
	amount: number;
}

export async function getOrder(orderId: string): Promise<Order> {
	const order = await db.Order.findOneById(orderId);
	if (!order) {
		throw Error(`no such order ${orderId}`); // XXX throw and exception that is convert-able to json
	}
	return orderDbToApi(order);
}

const openOrdersDB = new Map<string, db.OpenOrder>();
const expirationMin = 10; // 10 minutes
const graceMin = 10; // 10 minutes

export async function createOrder(offerId: string, userId: string): Promise<OpenOrder> {
	const openOrder: db.OpenOrder = {
		expiration: moment().add(expirationMin, "minutes").toDate(),
		id: generateId(IdPrefix.Transaction),
		offerId,
		userId };

	openOrdersDB.set(openOrder.id, openOrder);

	return {
		id: openOrder.id,
		expiration_date: openOrder.expiration.toISOString(),
	};
}

export async function submitEarn(orderId: string, form: string, walletAddress: string, appId: string): Promise<Order> {
	const openOrder: db.OpenOrder = openOrdersDB.get(orderId);
	if (!openOrder) {
		throw Error(`no such order ${orderId}`);
	}
	if (new Date() > openOrder.expiration) {
		throw Error(`order ${orderId} expired`);
	}

	// validate form
	if (!await offerContents.isValid(openOrder.offerId, form)) {
		throw Error(`submitted form is invalid for ${orderId}`);
	}

	const offer: offerDb.Offer = await offerDb.Offer.findOneById(openOrder.offerId);
	// create a transaction Order
	const order = Object.assign(new db.Order(), {
		id: openOrder.id,
		userId: openOrder.userId,
		offerId: openOrder.offerId,
		amount: offer.amount,
		type: "earn",
		status: "pending",
		meta: {
			title: offer.meta.order_meta.title,
			description: offer.meta.order_meta.description,
			call_to_action: offer.meta.order_meta.call_to_action,
		},
	});
	offer.cap.used += 1;
	await offer.save();
	await order.save();
	openOrdersDB.delete(openOrder.id);

	await payment.payTo(walletAddress, appId, order.amount, order.id);

	return orderDbToApi(order);
}

function orderDbToApi(order: db.Order): Order {
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
		amount: order.amount,
	};
}

export async function submitSpend(orderId: string): Promise<void> {
	return;
}

export async function cancelOrder(options): Promise<void> {
	return;
}

export async function getOrderHistory(
	userId: string, limit: number = 25, before?: string, after?: string): Promise<OrderList> {

	// XXX use the cursor input values
	const orders: db.Order[] = await db.Order.find({ where: { userId }, order: { createdDate: "DESC" }, take: limit });

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
