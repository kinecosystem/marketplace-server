import { LoggerInstance } from "winston";
import * as metrics from "../../metrics";
import { User } from "../../models/users";
import * as db from "../../models/orders";
import * as offerDb from "../../models/offers";
import { OrderValue } from "../../models/offers";

import { validateSpendJWT } from "../services/applications";

import { Paging } from "./index";
import * as payment from "./payment";
import { addWatcherEndpoint } from "./payment";
import * as offerContents from "./offer_contents";
import {
	ApiError,
	NoSuchOrder,
	NoSuchOffer,
	OfferCapReached,
	OpenedOrdersOnly,
	OpenOrderExpired,
	InvalidPollAnswers,
	ExternalOrderExhausted,
	OpenedOrdersUnreturnable } from "../../errors";

const CREATE_ORDER_RESOURCE_ID = "locks:orders:create";

export interface OrderList {
	orders: Order[];
	paging: Paging;
}

export interface BaseOrder {
	id: string;
	offer_id: string;
	offer_type: offerDb.OfferType;
	title: string;
	description: string;
	amount: number;
	blockchain_data: offerDb.BlockchainData;
}

export interface OpenOrder extends BaseOrder {
	expiration_date: string;
}

export interface Order extends BaseOrder {
	error?: ApiError;
	content?: string; // json serialized payload of the coupon page
	status: db.OrderStatus;
	completion_date: string; // UTC ISO
	result?: OrderValue;
	call_to_action?: string;
}

export async function getOrder(orderId: string, logger: LoggerInstance): Promise<Order> {
	const order = await db.Order.getOne(orderId, "!opened") as db.MarketplaceOrder | db.ExternalOrder;

	if (!order) {
		throw NoSuchOrder(orderId);
	}

	checkIfTimedOut(order); // no need to wait for the promise

	logger.info("getOne returning", { orderId, status: order.status, offerId: order.offerId, userId: order.userId });
	return orderDbToApi(order);
}

export async function createMarketplaceOrder(offerId: string, user: User, logger: LoggerInstance): Promise<OpenOrder> {
	logger.info("creating marketplace order for", { offerId, userId: user.id });
	const offer = await offerDb.Offer.findOneById(offerId);
	if (!offer) {
		throw NoSuchOffer(offerId);
	}

	let order = await db.Order.getOpenOrder(offerId, user.id);

	if (!order) {
		const create = async () => {
			if (await offer.didExceedCap(user.id)) {
				return undefined;
			}
			const order = db.MarketplaceOrder.new({
				offerId,
				userId: user.id,
				amount: offer.amount,
				type: offer.type,
				status: "opened",
				meta: offer.meta.order_meta,
				blockchainData: {
					sender_address: offer.type === "spend" ? user.walletAddress : offer.blockchainData.sender_address,
					recipient_address: offer.type === "spend" ? offer.blockchainData.recipient_address : user.walletAddress
				}
			});
			await order.save();
			return order;
		};

		// order = await lock(createOrderResourceId, create());
		order = await create();
	}

	if (!order) {
		throw OfferCapReached(offerId);
	}

	logger.info("created new open marketplace order", order);

	return openOrderDbToApi(order);
}

export async function createExternalOrder(jwt: string, user: User, logger: LoggerInstance): Promise<OpenOrder> {
	const offer = await validateSpendJWT(jwt, logger);
	await addWatcherEndpoint([offer.wallet_address]);  // XXX how can we avoid this and only do this for the first ever time we see this address?

	let order = await db.Order.getOpenOrder(offer.id, user.id);

	if (!order) {

		const count = await db.Order.countByOffer(offer.id, user.id);
		if (count > 0) {
			throw ExternalOrderExhausted();
		}

		order = db.ExternalOrder.new({
			userId: user.id,
			offerId: offer.id,
			amount: offer.amount,
			type: "spend", // TODO: we currently only support native spend
			status: "opened",
			meta: {
				title: offer.title,
				description: offer.description
			},
			blockchainData: {
				sender_address: user.walletAddress,
				recipient_address: offer.wallet_address
			}
		});
		await order.save();
	}

	logger.info("created new open external order", { offerId: offer.id, userId: user.id, orderId: order.id });

	return openOrderDbToApi(order);
}

export async function submitOrder(
	orderId: string, form: string | undefined, walletAddress: string, appId: string, logger: LoggerInstance): Promise<Order> {

	const order = await db.Order.findOne({ id: orderId }) as db.MarketplaceOrder | db.ExternalOrder;
	if (!order) {
		throw NoSuchOrder(orderId);
	}
	if (order.status !== "opened") {
		return orderDbToApi(order);
	}
	if (order.isExpired()) {
		throw OpenOrderExpired(orderId);
	}

	if (order.isMarketplaceOrder()) {
		const offer = await offerDb.Offer.findOneById(order.offerId);
		if (!offer) {
			throw NoSuchOffer(order.offerId);
		}
	}

	if (order.type === "earn") {
		// validate form
		if (!offerContents.isValid(order.offerId, form)) {
			throw InvalidPollAnswers();
		}

		await offerContents.savePollAnswers(order.userId, order.offerId, orderId, form);
	}

	order.setStatus("pending");
	await order.save();
	logger.info("order changed to pending", { orderId });

	if (order.type === "earn") {
		await payment.payTo(walletAddress, appId, order.amount, order.id, logger);
	}

	metrics.submitOrder(order.type, order.offerId);
	return orderDbToApi(order);
}

export async function cancelOrder(orderId: string, logger: LoggerInstance): Promise<void> {
	// you can only delete an open order - not a pending order
	const order = await db.Order.getOne(orderId, "opened");
	if (!order) {
		throw NoSuchOrder(orderId);
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
	const orders = await db.Order.getAll(userId, "!opened", limit) as Array<db.MarketplaceOrder | db.ExternalOrder>;

	return {
		orders: orders.map(order => {
			checkIfTimedOut(order); // no need to wait for the promise
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

function openOrderDbToApi(order: db.Order): OpenOrder {
	if (order.status !== "opened") {
		throw OpenedOrdersOnly();
	}
	return {
		id: order.id,
		offer_id: order.offerId,
		offer_type: order.type,
		amount: order.amount,
		title: order.meta.title,
		description: order.meta.description,
		blockchain_data: order.blockchainData,
		expiration_date: order.expirationDate!.toISOString()
	};
}

function orderDbToApi(order: db.Order): Order {
	if (order.status === "opened") {
		throw OpenedOrdersUnreturnable();
	}

	return {
		id: order.id,
		offer_id: order.offerId,
		offer_type: order.type,
		status: order.status,
		amount: order.amount,
		title: order.meta.title,
		description: order.meta.description,
		call_to_action: order.meta.call_to_action,
		completion_date: (order.currentStatusDate || order.createdDate).toISOString(), // XXX should we separate the dates?
		content: order.meta.content,  // will be empty for external order
		blockchain_data: order.blockchainData,
		error: order.error,  // will be null for anything other than "failed"
		result: order.value,  // will be a coupon code or a confirm_payment JWT
	};
}

function checkIfTimedOut(order: db.Order): Promise<void> {
	if (order.status === "pending" && order.isExpired()) {
		order.setStatus("failed");
		// TODO: add order.error

		return order.save() as any;
	}

	return Promise.resolve();
}
