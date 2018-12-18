import * as moment from "moment";
import { Request as ExpressRequest } from "express-serve-static-core";
import { getDefaultLogger as logger } from "../../logging";

import { pick } from "../../utils/utils";
import { lock } from "../../redis";
import * as metrics from "../../metrics";
import { User } from "../../models/users";
import * as db from "../../models/orders";
import * as offerDb from "../../models/offers";
import { OrderValue } from "../../models/offers";
import { Application, AppOffer } from "../../models/applications";
import { isExternalEarn, isPayToUser, validateExternalOrderJWT } from "../services/native_offers";
import {
	ApiError,
	NoSuchApp,
	NoSuchUser,
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
import { ExternalEarnOrderJWT, ExternalPayToUserOrderJwt, ExternalSpendOrderJWT } from "./native_offers";
import {
	create as createEarnTransactionBroadcastToBlockchainSubmitted
} from "../../analytics/events/earn_transaction_broadcast_to_blockchain_submitted";
import { OrderTranslations } from "../routes/orders";

import { throwOnAppEarnLimit, throwOnUserEarnLimit } from "../../utils/rate_limit";

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
	nonce: string;
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

export async function getOrder(orderId: string, userId: string): Promise<Order> {
	const order = await db.Order.getOne(orderId, "!opened") as db.MarketplaceOrder | db.ExternalOrder;

	if (!order) {
		throw NoSuchOrder(orderId);
	}

	checkIfTimedOut(order); // no need to wait for the promise

	logger().debug("getOne returning", {
		orderId,
		status: order.status,
		offerId: order.offerId,
		contexts: order.contexts
	});
	return orderDbToApi(order, userId);
}

export async function changeOrder(orderId: string, userId: string, change: Partial<Order>): Promise<Order> {
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

	logger().debug("order patched with error", { orderId, contexts: order.contexts, error: change.error });
	return orderDbToApi(order, userId);
}

async function createOrder(appOffer: AppOffer, user: User, orderTranslations = {} as OrderTranslations) {
	const app = (await Application.findOneById(user.appId))!;
	if (appOffer.offer.type === "earn") {
		await throwOnAppEarnLimit(app.id, "total_earn", app.config.limits.minute_total_earn, moment.duration({ minutes: 1 }), appOffer.offer.amount);
		await throwOnAppEarnLimit(app.id, "total_earn", app.config.limits.hourly_total_earn, moment.duration({ hours: 1 }), appOffer.offer.amount);
		await throwOnUserEarnLimit(user.id, "user_earn", app.config.limits.daily_user_earn, moment.duration({ days: 1 }), appOffer.offer.amount);
	}

	if (await appOffer.didExceedCap(user.id)) {
		return undefined;
	}

	const orderMeta = appOffer.offer.meta.order_meta;
	orderMeta.title = orderTranslations.orderTitle || orderMeta.title;
	orderMeta.description = orderTranslations.orderDescription || orderMeta.description;

	const order = db.MarketplaceOrder.new({
		status: "opened",
		offerId: appOffer.offer.id,
		amount: appOffer.offer.amount,
		blockchainData: {
			sender_address: appOffer.offer.type === "spend" ? user.walletAddress : appOffer.walletAddress,
			recipient_address: appOffer.offer.type === "spend" ? appOffer.walletAddress : user.walletAddress
		}
	}, {
		user,
		type: appOffer.offer.type,
		// TODO if order meta content is a template:
		// replaceTemplateVars(offer, offer.meta.order_meta.content!)
		meta: orderMeta,
	});
	await order.save();

	metrics.createOrder("marketplace", appOffer.offer.type, appOffer.offer.id, user.appId);

	return order;
}

export async function createMarketplaceOrder(offerId: string, user: User, orderTranslations?: OrderTranslations): Promise<OpenOrder> {
	logger().info("creating marketplace order for", { offerId, userId: user.id });

	const appOffer = await AppOffer.findOne({ offerId, appId: user.appId });
	if (!appOffer) {
		throw NoSuchOffer(offerId);
	}

	const order = await lock(getLockResource("get", offerId, user.id), async () =>
		(await db.Order.getOpenOrder(offerId, user.id)) ||
		(await lock(getLockResource("create", offerId), () => createOrder(appOffer, user, orderTranslations)))
	);

	if (!order) {
		throw OfferCapReached(offerId);
	}

	logger().info("created new open marketplace order", order);

	return openOrderDbToApi(order, user.id);
}

async function createP2PExternalOrder(sender: User, jwt: ExternalPayToUserOrderJwt): Promise<db.ExternalOrder> {
	const recipient = await User.findOne({ appId: sender.appId, appUserId: jwt.recipient.user_id });

	if (!recipient) {
		throw NoSuchUser(jwt.recipient.user_id);
	}

	const order = db.ExternalOrder.new({
		offerId: jwt.offer.id,
		amount: jwt.offer.amount,
		status: "opened",
		nonce: jwt.nonce,
		blockchainData: {
			sender_address: sender.walletAddress,
			recipient_address: recipient.walletAddress
		}
	}, {
		type: "earn",
		user: recipient,
		meta: pick(jwt.recipient, "title", "description")
	}, {
		type: "spend",
		user: sender,
		meta: pick(jwt.sender, "title", "description")
	});

	await addWatcherEndpoint(recipient.walletAddress, order.id);
	return order;
}

async function createNormalEarnExternalOrder(recipient: User, jwt: ExternalEarnOrderJWT) {
	const app = await Application.findOneById(recipient.appId);

	await throwOnUserEarnLimit(recipient.id, "user_earn", app!.config.limits.daily_user_earn, moment.duration({ days: 1 }), jwt.offer.amount);

	if (!app) {
		throw NoSuchApp(recipient.appId);
	}

	return db.ExternalOrder.new({
		offerId: jwt.offer.id,
		amount: jwt.offer.amount,
		nonce: jwt.nonce,
		status: "opened",
		blockchainData: {
			sender_address: app.walletAddresses.sender,
			recipient_address: recipient.walletAddress
		}
	}, {
		type: "earn",
		user: recipient,
		meta: pick(jwt.recipient, "title", "description")
	});
}

async function createNormalSpendExternalOrder(sender: User, jwt: ExternalSpendOrderJWT) {
	const app = await Application.findOneById(sender.appId);

	if (!app) {
		throw NoSuchApp(sender.appId);
	}

	const order = db.ExternalOrder.new({
		offerId: jwt.offer.id,
		amount: jwt.offer.amount,
		status: "opened",
		nonce: jwt.nonce,
		blockchainData: {
			sender_address: sender.walletAddress,
			recipient_address: app.walletAddresses.recipient
		}
	}, {
		type: "spend",
		user: sender,
		meta: pick(jwt.sender, "title", "description")
	});

	await addWatcherEndpoint(app.walletAddresses.recipient, order.id);

	return order;
}

export async function createExternalOrder(jwt: string, user: User): Promise<OpenOrder> {
	logger().info("createExternalOrder", { jwt });
	const payload = await validateExternalOrderJWT(jwt, user.appUserId);
	const nonce = payload.nonce || db.Order.DEFAULT_NONCE;

	let order = await db.Order.findBy({ offerId: payload.offer.id, userId: user.id, nonce });

	if (!order || order.status === "failed") {
		if (isPayToUser(payload)) {
			order = await createP2PExternalOrder(user, payload);
		} else if (isExternalEarn(payload)) {
			order = await createNormalEarnExternalOrder(user, payload);
		} else {
			order = await createNormalSpendExternalOrder(user, payload);
		}

		await order.save();

		order.contexts.forEach(context => {
			metrics.createOrder("external", context.type, payload.offer.id, user.appId);
		});

		logger().info("created new open external order", {
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
	acceptsLanguagesFunc?: ExpressRequest["acceptsLanguages"]): Promise<Order> {

	logger().info("submitOrder", { orderId });
	const order = await db.Order.getOne(orderId) as db.MarketplaceOrder | db.ExternalOrder;

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
			const offerContent = (await offerContents.getOfferContent(order.offerId))!;

			switch (offerContent.contentType) {
				// TODO this switch-case should be inside the offerContents module
				case "poll":
					// validate form
					if (!offerContents.isValid(offerContent, form)) {
						throw InvalidPollAnswers();
					}
					await offerContents.savePollAnswers(order.user.id, order.offerId, orderId, form); // TODO should we also save quiz results?
					break;
				case "quiz":
					order.amount = await offerContents.sumCorrectQuizAnswers(offerContent, form, acceptsLanguagesFunc) || 1; // TODO remove || 1 - don't give idiots kin
					// should we replace order.meta.content
					break;
				case "tutorial":
					// nothing
					break;
				default:
					logger().warn(`unexpected content type ${offerContent.contentType}`);
			}
		}
	}

	order.setStatus("pending");
	await order.save();
	logger().info("order changed to pending", { orderId });

	if (order.isEarn()) {
		await payment.payTo(walletAddress, appId, order.amount, order.id);
		createEarnTransactionBroadcastToBlockchainSubmitted(order.contexts[0].user.id, order.offerId, order.id).report();
	}

	order.contexts.forEach(context => {
		metrics.submitOrder(context.type, order.offerId, appId);
	});
	return orderDbToApi(order, userId);
}

export async function cancelOrder(orderId: string): Promise<void> {
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

function openOrderDbToApi(order: db.Order, userId: string): OpenOrder {
	if (order.status !== "opened") {
		throw OpenedOrdersOnly();
	}

	const context = order.contextFor(userId)!;
	return {
		id: order.id,
		nonce: order.nonce,
		offer_id: order.offerId,
		offer_type: context.type,
		amount: order.amount,
		title: context.meta.title,
		description: context.meta.description,
		blockchain_data: order.blockchainData,
		expiration_date: order.expirationDate!.toISOString()
	};
}

function orderDbToApi(order: db.Order, userId: string): Order {
	if (order.status === "opened") {
		throw OpenedOrdersUnreturnable();
	}

	const context = order.contextFor(userId)!;
	const apiOrder = Object.assign(
		pick(order, "id", "origin", "status", "amount"), {
			result: order.value,
			offer_type: context.type,
			offer_id: order.offerId,
			error: order.error as ApiError,
			blockchain_data: order.blockchainData,
			completion_date: (order.currentStatusDate || order.createdDate).toISOString()
		}, pick(context.meta, "title", "description", "content", "call_to_action")) as Order;

	return apiOrder;
}

export async function setFailedOrder(order: db.Order, error: MarketplaceError, failureDate?: Date): Promise<db.Order> {
	order.setStatus("failed");
	order.currentStatusDate = failureDate || order.currentStatusDate;
	order.error = error.toJson();

	order.contexts.forEach(context => {
		metrics.orderFailed(order);
	});

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
