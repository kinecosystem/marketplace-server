import { Paging, ServiceResult } from "./index";
import { PollAnswer } from "./offers";
import * as offerDb from "../models/offers";
import * as db from "../models/orders";
import { generateId, IdPrefix } from "../utils";
import { getLogger } from "../logging";

const logger = getLogger();

export interface SpendResult {
	offer_type: "SpendResult";
	asset: {
		coupon_code: string;
		asset_type: "coupon_code";
	};
}

export interface EarnResult {
	offer_type: "EarnResult";
	transaction_id: string;
	sender_address: string;
}

export interface EarnSubmission {
	recipient_address: string;
	completed_form?: PollAnswer;
}

export interface SpendSubmission {
	transaction_id: string;
	sender_address?: string;
}

export interface SubmissionResult {
	order_id: string;
	content: SpendResult | EarnResult;
}

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
	reason?: string;
}

export interface OpenOrder {
	order_id: string;
	blockchain_data?: BlockchainData;
	expiration: string;
}

export interface Order {
	order_id: string;
	blockchain_data: BlockchainData;
	result?: OrderResult;
	status: "completed" | "failed" | "pending";
	completion_date: string; // UTC ISO
	offer_type: "earn" | "spend";
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

const openOrdersDB: Map<string, db.OpenOrder> = new Map<string, db.OpenOrder>();
const expirationTime = (10 * 60 * 1000); // 10 minutes
const graceTime = (10 * 60 * 1000); // 10 minutes

export async function createOrder(offerId: string, userId: string): Promise<OpenOrder> {
	const expiration = new Date();
	expiration.setTime(expiration.getTime() + expirationTime);

	const openOrder = Object.assign(
		new db.OpenOrder(),
		{ expiration, id: generateId(IdPrefix.Transaction), offerId, userId });

	openOrdersDB.set(openOrder.id, openOrder);

	return {
		order_id: openOrder.id,
		expiration: openOrder.expiration.toISOString(),
	};
}

export async function submitEarn(orderId: string, form: string, walletAddress: string): Promise<Order> {
	const openOrder: db.OpenOrder = openOrdersDB.get(orderId);
	if (!openOrder) {
		throw Error(`no such order ${orderId}`);
	}
	if (new Date() > openOrder.expiration) {
		throw Error(`order ${orderId} expired`);
	}

	// validate form
	if (!JSON.parse(form).ok) {
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
		meta: {
			title: offer.meta.title,
			description: offer.meta.description,
			image: offer.meta.image,
			call_to_action: offer.meta.description,
		},
	});
	offer.cap.used += 1;
	await offer.save();
	await order.save();
	openOrdersDB.delete(openOrder.id);

	payTo(walletAddress, order.amount, order.id);

	return orderDbToApi(order);
}

function orderDbToApi(order: db.Order): Order {
	return {
		status: order.status,
		order_id: order.id,
		completion_date: order.createdDate.toISOString(),
		blockchain_data: order.blockchainData,
		offer_type: order.type,
		title: order.meta.title,
		description: order.meta.description,
		call_to_action: order.meta.call_to_action,
		amount: order.amount,
	};
}

async function payTo(walletAddress: string, amount: number, orderId: string) {
	// async in a payment service written in python
	// with GlobalLock(orderId) {
	logger.info(`paying ${amount} to ${walletAddress} with meta ${orderId}`);
	const txId: string = generateId();
	const order = await db.Order.findOneById(orderId);
	order.blockchainData = { transaction_id: txId };
	order.save();
}

export async function submitSpend(orderId: string): Promise<void> {
	return;
}

export async function cancelOrder(options): Promise<void> {
	return;
}

export async function getOrderHistory(
	userId: string,
	limit?: number,
	before?: string,
	after?: string): Promise<OrderList> {

	// XXX use the cursor input values
	const orders: db.Order[] = await db.Order.find({ userId });

	return {
		orders: orders.map(order => {
			return orderDbToApi(order);
		}),
		paging: {
			cursors: {
				after: "MTAxNTExOTQ1MjAwNzI5NDE",
				before: "NDMyNzQyODI3OTQw",
			},
			previous: "https://graph.facebook.com/me/albums?limit=25&before=NDMyNzQyODI3OTQw",
			next: "https://graph.facebook.com/me/albums?limit=25&after=MTAxNTExOTQ1MjAwNzI5NDE=",
		},
	};
}
