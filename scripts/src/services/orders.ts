import moment = require("moment");
import { LoggerInstance } from "winston";

import * as db from "../models/orders";
import * as offerDb from "../models/offers";
import { generateId, IdPrefix } from "../utils";

import { Paging } from "./index";
import * as offerContents from "./offer_contents";
import * as payment from "./payment";
import { AssetValue } from "../models/offers";
import { FailureReason } from "../models/orders";
import { Asset } from "../models/offers";
import { CompletedPayment, paymentComplete } from "./internal";

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

	const openOrder: db.OpenOrder = openOrdersDB.get(orderId);
	if (!openOrder) {
		throw Error(`no such order ${orderId}`);
	}
	if (new Date() > openOrder.expiration) {
		throw Error(`order ${orderId} expired`);
	}
	const offer = await offerDb.Offer.findOneById(openOrder.offerId);

	// transition open order to pending order
	const order = Object.assign(new db.Order(), {
		id: openOrder.id,
		userId: openOrder.userId,
		offerId: openOrder.offerId,
		amount: offer.amount,
		type: offer.type,
		status: "pending",
		meta: offer.meta.order_meta,
	});
	offer.cap.used += 1;
	await offer.save();
	await order.save();

	if (offer.type === "earn") {
		await submitEarn(openOrder, offer, form, walletAddress, appId, logger);
	} else {
		await submitSpend(openOrder, offer, walletAddress, appId, logger);
	}

	openOrdersDB.delete(openOrder.id);
	return orderDbToApi(order, logger);
}

async function submitEarn(
	openOrder: db.OpenOrder, offer: offerDb.Offer, form: string, walletAddress: string, appId: string, logger: LoggerInstance): Promise<void> {
	// validate form
	if (!await offerContents.isValid(offer.id, form, logger)) {
		throw Error(`submitted form is invalid for ${openOrder.id}`);
	}

	await payment.payTo(walletAddress, appId, offer.amount, openOrder.id, logger);
}

export async function submitSpend(
	openOrder: db.OpenOrder, offer: offerDb.Offer, walletAddress: string, appId: string, logger: LoggerInstance): Promise<void> {
	// start a timer for order.expiration + grace till this order becomes failed
	async function makeFailed() {
		// XXX lock on order.id
		const order = await db.Order.findOneById(openOrder.id);
		order.status = "failed";
		const offer = await offerDb.Offer.findOneById(openOrder.offerId);
		offer.cap.used -= 1;
		await offer.save();
		await order.save();
	}

	// XXX simulate payment complete
	// setTimeout(makeFailed, openOrder.expiration);
	const payment: CompletedPayment = {
		id: openOrder.id,
		app_id: appId,
		transaction_id: "some transaction",
		recipient_address: offer.blockchainData.recipient_address, // offer received the kin
		sender_address: walletAddress, // user sent the kin
		amount: offer.amount,
		timestamp: (new Date()).toISOString(),
	};

	paymentComplete(payment, logger);
	return;
}

export async function cancelOrder(options, logger: LoggerInstance): Promise<void> {
	return;
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
