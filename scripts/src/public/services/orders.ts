import { LoggerInstance } from "winston";

import { lock } from "../../redis";
import * as metrics from "../../metrics";
import { User } from "../../models/users";
import * as db from "../../models/orders";
import * as offerDb from "../../models/offers";
import { OrderValue } from "../../models/offers";
import { validateExternalOrderJWT } from "../services/native_offers";
import {
	ApiError,
	NoSuchOrder,
	NoSuchOffer,
	OfferCapReached,
	OpenedOrdersOnly,
	OpenOrderExpired,
	InvalidPollAnswers,
	ExternalOrderAlreadyCompleted,
	OpenedOrdersUnreturnable, CompletedOrderCantTransitionToFailed
} from "../../errors";

import { Paging } from "./index";
import * as payment from "./payment";
import { addWatcherEndpoint } from "./payment";
import * as offerContents from "./offer_contents";
import { ExternalSpendOrderJWT, ExternalEarnOrderJWT } from "./native_offers";

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
	error?: ApiError | null;
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

	logger.debug("getOne returning", { orderId, status: order.status, offerId: order.offerId, userId: order.userId });
	return orderDbToApi(order);
}

export async function changeOrder(orderId: string, change: Partial<Order>, logger: LoggerInstance): Promise<Order> {
	const order = await db.Order.getOne(orderId, "!opened") as db.MarketplaceOrder | db.ExternalOrder;

	if (!order) {
		throw NoSuchOrder(orderId);
	}
	if (order.status === "completed") {
		throw CompletedOrderCantTransitionToFailed();
	}
	order.error = change.error;
	order.status = "failed";
	await order.save();

	logger.debug("order patched with error", { orderId, userId: order.userId, error: change.error });
	return orderDbToApi(order);
}

async function createOrder(offer: offerDb.Offer, user: User) {
	if (await offer.didExceedCap(user.id)) {
		return undefined;
	}

	const order = db.MarketplaceOrder.new({
		userId: user.id,
		type: offer.type,
		status: "opened",
		offerId: offer.id,
		amount: offer.amount,
		// TODO if order meta content is a template:
		// replaceTemplateVars(offer, offer.meta.order_meta.content!)
		meta: offer.meta.order_meta,
		blockchainData: {
			sender_address: offer.type === "spend" ? user.walletAddress : offer.blockchainData.sender_address,
			recipient_address: offer.type === "spend" ? offer.blockchainData.recipient_address : user.walletAddress
		}
	});

	await order.save();
	return order;
}

export async function createMarketplaceOrder(offerId: string, user: User, logger: LoggerInstance): Promise<OpenOrder> {
	logger.info("creating marketplace order for", { offerId, userId: user.id });
	const offer = await offerDb.Offer.findOneById(offerId);
	if (!offer) {
		throw NoSuchOffer(offerId);
	}

	/*let order = await lock(getLockResource("get", offerId, user.id), async () => {
		return await db.Order.getOpenOrder(offerId, user.id);
	});*/
	let order = await lock(getLockResource("get", offerId, user.id), () => db.Order.getOpenOrder(offerId, user.id));

	if (!order) {
		order = await lock(getLockResource("create", offerId), () => createOrder(offer, user));
	}

	if (!order) {
		throw OfferCapReached(offerId);
	}

	logger.info("created new open marketplace order", order);

	return openOrderDbToApi(order);
}

export async function createExternalOrder(jwt: string, user: User, logger: LoggerInstance): Promise<OpenOrder> {
	const payload = await validateExternalOrderJWT(jwt, user.appUserId, logger);

	let order = await db.Order.findOne({ userId: user.id, offerId: payload.offer.id });

	if (!order || order.status !== "opened") {
		if (order && (order.status === "completed" || order.status === "pending")) {
			throw ExternalOrderAlreadyCompleted(order.id);
		} // else order.status === "failed" - act as if order didn't exist

		// hack - to get the wallet for this digital service
		// currently there is only a single wallet, so I'm just selecting the first wallet data
		const tmpBlockchainData = (await offerDb.Offer.findOne({ type: payload.sub }))!.blockchainData;

		let title: string;
		let description: string;
		let sender_address: string;
		let recipient_address: string;
		if (payload.sub === "earn") {
			title = (payload as ExternalEarnOrderJWT).recipient.title;
			description = (payload as ExternalEarnOrderJWT).recipient.description;
			sender_address = tmpBlockchainData.sender_address!;
			recipient_address = user.walletAddress;
		} else {
			// spend or pay_to_user
			await addWatcherEndpoint([tmpBlockchainData.recipient_address!]);  // XXX how can we avoid this and only do this for the first ever time we see this address?
			title = (payload as ExternalSpendOrderJWT).sender.title;
			description = (payload as ExternalSpendOrderJWT).sender.description;
			sender_address = user.walletAddress;
			// TODO in case of pay_to_user, needs another lookup for the recipient_user_wallet
			recipient_address = tmpBlockchainData.recipient_address!;
		}

		order = db.ExternalOrder.new({
			userId: user.id,
			offerId: payload.offer.id,
			amount: payload.offer.amount,
			type: payload.sub,
			status: "opened",
			meta: {
				title,
				description
			},
			blockchainData: {
				sender_address,
				recipient_address
			}
		});
		await order.save();

		logger.info("created new open external order", {
			offerId: payload.offer.id,
			userId: user.id,
			orderId: order.id
		});
	}

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

		if (order.type === "earn") {
			const offerContent = (await offerContents.getOfferContent(order.offerId, logger))!;
			switch (offerContent.contentType) {
				// TODO this switch-case should be inside the offerContents module
				case "poll":
					// validate form
					if (!offerContents.isValid(offerContent, form)) {
						throw InvalidPollAnswers();
					}
					await offerContents.savePollAnswers(order.userId, order.offerId, orderId, form); // TODO should we also save quiz results?
					break;
				case "quiz":
					order.amount = offerContents.sumCorrectQuizAnswers(offerContent, form) || 1; // TODO remove || 1 - don't give idiots kin
					// should we replace order.meta.content
					break;
				default:
					logger.warn(`unexpected content type ${offerContent.contentType}`);
			}

		}

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
	filters: { origin?: db.OrderOrigin; offerId?: string; },
	logger: LoggerInstance,
	limit: number = 25,
	before?: string,
	after?: string): Promise<OrderList> {

	// XXX use the cursor input values
	const status: db.OrderStatusAndNegation = "!opened";
	const orders = await db.Order.getAll(
		Object.assign({}, filters, { userId, status }),
		limit
	) as Array<db.MarketplaceOrder | db.ExternalOrder>;

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
		error: order.error as ApiError,  // will be null for anything other than "failed"
		result: order.value,  // will be a coupon code or a payment_confirmation JWT
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

function getLockResource(type: "create" | "get", ...ids: string[]) {
	return `locks:orders:${ type }:${ ids.join(":") }`;
}
