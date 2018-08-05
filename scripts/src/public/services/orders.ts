import { LoggerInstance } from "winston";

import { pick } from "../../utils";
import { lock } from "../../redis";
import * as metrics from "../../metrics";
import { User } from "../../models/users";
import * as db from "../../models/orders";
import * as offerDb from "../../models/offers";
import { OrderValue } from "../../models/offers";
import { Application } from "../../models/applications";
import { validateExternalOrderJWT } from "../services/native_offers";
import {
	ApiError,
	NoSuchApp,
	CompletedOrderCantTransitionToFailed,
	ExternalOrderAlreadyCompleted,
	InvalidPollAnswers, MarketplaceError,
	NoSuchOffer,
	NoSuchOrder,
	OfferCapReached,
	OpenedOrdersOnly,
	OpenedOrdersUnreturnable,
	OpenOrderExpired,
	TransactionTimeout
} from "../../errors";

import { Paging } from "./index";
import * as payment from "./payment";
import { addWatcherEndpoint } from "./payment";
import * as offerContents from "./offer_contents";
import { ExternalEarnOrderJWT, ExternalSpendOrderJWT } from "./native_offers";
import {
	create as createEarnTransactionBroadcastToBlockchainSubmitted
} from "../../analytics/events/earn_transaction_broadcast_to_blockchain_submitted";
import { OrderMeta } from "../../models/orders";

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
	origin: db.OrderOrigin;
}

export async function getOrder(orderId: string, userId: string, logger: LoggerInstance): Promise<Order> {
	const order = await db.Order.getOne(orderId, "!opened") as db.MarketplaceOrder | db.ExternalOrder;

	if (!order) {
		throw NoSuchOrder(orderId);
	}

	checkIfTimedOut(order); // no need to wait for the promise

	logger.debug("getOne returning", { orderId, status: order.status, offerId: order.offerId, contexts: order.contexts });
	return orderDbToApi(order, userId);
}

export async function changeOrder(orderId: string, userId: string, change: Partial<Order>, logger: LoggerInstance): Promise<Order> {
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

	logger.debug("order patched with error", { orderId, contexts: order.contexts, error: change.error });
	return orderDbToApi(order, userId);
}

async function createOrder(offer: offerDb.Offer, user: User) {
	if (await offer.didExceedCap(user.id)) {
		return undefined;
	}

	const order = db.MarketplaceOrder.new({
		type: offer.type,
		status: "opened",
		offerId: offer.id,
		amount: offer.amount,
		blockchainData: {
			sender_address: offer.type === "spend" ? user.walletAddress : offer.blockchainData.sender_address,
			recipient_address: offer.type === "spend" ? offer.blockchainData.recipient_address : user.walletAddress
		}
	});
	await order.save();

	const context = db.OrderContext.new({
		user, order,
		orderId: order.id,
		userId: user.id,
		// TODO if order meta content is a template:
		// replaceTemplateVars(offer, offer.meta.order_meta.content!)
		meta: offer.meta.order_meta,
		role: offer.type === "spend" ? "sender" : "recipient"
	});
	await context.save();

	order.contexts.push(context);

	metrics.createOrder("marketplace", offer.type, offer.id);

	return order;
}

export async function createMarketplaceOrder(offerId: string, user: User, logger: LoggerInstance): Promise<OpenOrder> {
	logger.info("creating marketplace order for", { offerId, userId: user.id });

	const offer = await offerDb.Offer.findOneById(offerId);
	if (!offer) {
		throw NoSuchOffer(offerId);
	}

	const order = await lock(getLockResource("get", offerId, user.id), async () =>
		(await db.Order.getOpenOrder(offerId, user.id)) ||
		(await lock(getLockResource("create", offerId), () => createOrder(offer, user)))
	);

	if (!order) {
		throw OfferCapReached(offerId);
	}

	logger.info("created new open marketplace order", order);

	return openOrderDbToApi(order, user.id);
}

export async function createExternalOrder(jwt: string, user: User, logger: LoggerInstance): Promise<OpenOrder> {
	const payload = await validateExternalOrderJWT(jwt, user.appUserId, logger);

	let order = await db.Order.findBy(payload.offer.id, user.id);

	if (!order || order.status === "failed") {
		const app = await Application.findOneById(user.appId);
		if (!app) {
			throw NoSuchApp(user.appId);
		}

		let title: string;
		let description: string;
		let sender_address: string;
		let recipient_address: string;
		if (payload.sub === "earn") {
			title = (payload as ExternalEarnOrderJWT).recipient.title;
			description = (payload as ExternalEarnOrderJWT).recipient.description;
			sender_address = app.walletAddresses.sender;
			recipient_address = user.walletAddress;
		} else {
			// spend or pay_to_user
			await addWatcherEndpoint([app.walletAddresses.recipient]);  // XXX how can we avoid this and only do this for the first ever time we see this address?
			title = (payload as ExternalSpendOrderJWT).sender.title;
			description = (payload as ExternalSpendOrderJWT).sender.description;
			sender_address = user.walletAddress;
			// TODO in case of pay_to_user, needs another lookup for the recipient_user_wallet
			recipient_address = app.walletAddresses.recipient;
		}

		order = db.ExternalOrder.new({
			offerId: payload.offer.id,
			amount: payload.offer.amount,
			type: payload.sub,
			status: "opened",
			blockchainData: {
				sender_address,
				recipient_address
			}
		});
		await order.save();

		const context = db.OrderContext.new({
			user, order,
			orderId: order.id,
			userId: user.id,
			meta: {
				title,
				description
			},
			role: payload.sub === "spend" ? "recipient" : "sender"
		});

		await context.save();
		order.contexts.push(context);
		metrics.createOrder("external", payload.sub, payload.offer.id);

		logger.info("created new open external order", {
			offerId: payload.offer.id,
			userId: user.id,
			orderId: order.id
		});
	} else if (order.status === "pending" || order.status === "completed") {
		throw ExternalOrderAlreadyCompleted(order.id);
	}

	return openOrderDbToApi(order, user.id);
}

export async function submitOrder(
	orderId: string,
	userId: string,
	form: string | undefined,
	walletAddress: string,
	appId: string,
	logger: LoggerInstance): Promise<Order> {

	const order = await db.Order.getOne(orderId) as db.MarketplaceOrder | db.ExternalOrder;
	// const order = await db.Order.findOneById(orderId, { relations: ["contexts"] }) as db.MarketplaceOrder | db.ExternalOrder;
	if (!order) {
		throw NoSuchOrder(orderId);
	}
	if (order.status !== "opened") {
		return orderDbToApi(order, userId);
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
					await offerContents.savePollAnswers(order.recipient!.id, order.offerId, orderId, form); // TODO should we also save quiz results?
					break;
				case "quiz":
					order.amount = offerContents.sumCorrectQuizAnswers(offerContent, form) || 1; // TODO remove || 1 - don't give idiots kin
					// should we replace order.meta.content
					break;
				case "tutorial":
					// nothing
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
		createEarnTransactionBroadcastToBlockchainSubmitted(order.recipient!.id, order.offerId, order.id).report();
	}

	metrics.submitOrder(order.type, order.offerId);
	return orderDbToApi(order, userId);
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
			return orderDbToApi(order, userId);
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

function getMeta(order: db.NormalOrder | db.P2POrder, userId: string) {
	if (order.isNormal()) {
		return order.meta;
	} else if (order.isP2P() && order.sender.id === userId) {
		return order.senderMeta;
	} else {
		return order.recipientMeta;
	}
}

function openOrderDbToApi(order: db.Order, userId: string): OpenOrder {
	if (order.status !== "opened") {
		throw OpenedOrdersOnly();
	}

	const meta = getMeta(order as db.P2POrder | db.NormalOrder, userId);
	return {
		id: order.id,
		offer_id: order.offerId,
		offer_type: order.type,
		amount: order.amount,
		title: meta.title,
		description: meta.description,
		blockchain_data: order.blockchainData,
		expiration_date: order.expirationDate!.toISOString()
	};
}

function orderDbToApi(order: db.Order, userId: string): Order {
	if (order.status === "opened") {
		throw OpenedOrdersUnreturnable();
	}

	const meta = getMeta(order as db.P2POrder | db.NormalOrder, userId);

	const apiOrder = Object.assign(
		pick(order, "id", "origin", "status", "amount"), {
			result: order.value,
			offer_type: order.type,
			offer_id: order.offerId,
			error: order.error as ApiError,
			blockchain_data: order.blockchainData,
			completion_date: (order.currentStatusDate || order.createdDate).toISOString()
		}, pick(meta, "title", "description", "content", "call_to_action")) as Order;

	return apiOrder;
}

export async function setFailedOrder(order: db.Order, error: MarketplaceError, failureDate?: Date): Promise<db.Order> {
	order.setStatus("failed");
	order.currentStatusDate = failureDate || order.currentStatusDate;
	order.error = error.toJson();

	if (order.origin === "p2p") {
		// TODO: which user to send? maybe both?
	} else if (order.type === "earn") {
		metrics.orderFailed(order, await User.findOneById(order.recipient!.id));
	} else {
		metrics.orderFailed(order, await User.findOneById(order.sender!.id));
	}

	return await order.save();
}

function checkIfTimedOut(order: db.Order): Promise<void> {
	// TODO This should be done in a cron that runs every 10 minutes and closes these orders
	if (order.status === "pending" && order.isExpired()) {
		return setFailedOrder(order, TransactionTimeout(), order.expirationDate) as any;
	}

	return Promise.resolve();
}

function getLockResource(type: "create" | "get", ...ids: string[]) {
	return `locks:orders:${ type }:${ ids.join(":") }`;
}
