import * as moment from "moment";
import { Request as ExpressRequest } from "express-serve-static-core";

import { lock } from "../../redis";
import * as metrics from "../../metrics";
import { User } from "../../models/users";
import * as db from "../../models/orders";
import * as offerDb from "../../models/offers";
import { OrderValue } from "../../models/offers";
import { getDefaultLogger as logger } from "../../logging";
import { pick, capitalizeFirstLetter } from "../../utils/utils";
import { Application, AppOffer } from "../../models/applications";
import {
	isPayToUser,
	isExternalEarn,
	ExternalEarnOrderJWT,
	ExternalSpendOrderJWT,
	validateExternalOrderJWT,
	ExternalPayToUserOrderJWT } from "./native_offers";
import {
	ApiError,
	NoSuchApp,
	NoSuchUser,
	CompletedOrderCantTransitionToFailed,
	ExternalOrderAlreadyCompleted,
	InvalidPollAnswers, MarketplaceError,
	NoSuchOffer,
	NoSuchOrder,
	UserHasNoWallet,
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
import {
	create as createEarnTransactionBroadcastToBlockchainSubmitted
} from "../../analytics/events/earn_transaction_broadcast_to_blockchain_submitted";
import { OrderTranslations } from "../routes/orders";

import { assertRateLimitAppEarn, assertRateLimitUserEarn, assertRateLimitWalletEarn } from "../../utils/rate_limit";

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

export async function getOrder(orderId: string, user: User): Promise<Order> {
	const order = await db.Order.getOne({ orderId, status: "!opened" });

	if (!order || order.contextForUser(user.id) === null) {
		throw NoSuchOrder(orderId);
	}

	checkIfTimedOut(order); // no need to wait for the promise

	const wallet = (await user.getWallets()).lastUsed();
	if (!wallet) {
		throw UserHasNoWallet(user.id);
	}

	logger().debug("getOne returning", {
		orderId,
		status: order.status,
		offerId: order.offerId,
		contexts: order.contexts
	});

	return await orderDbToApi(order, user.id, wallet.address);
}

export async function changeOrder(orderId: string, user: User, change: Partial<Order>): Promise<Order> {
	const order = await db.Order.getOne({ orderId, status: "!opened" });

	if (!order || order.contextForUser(user.id) === null) {
		throw NoSuchOrder(orderId);
	}
	if (order.status === "completed") {
		throw CompletedOrderCantTransitionToFailed();
	}

	order.error = change.error;
	order.status = "failed";
	await order.save();

	const wallet = (await user.getWallets()).lastUsed();
	if (!wallet) {
		throw UserHasNoWallet(user.id);
	}

	logger().debug("order patched with error", { orderId, contexts: order.contexts, error: change.error });
	return await orderDbToApi(order, user.id, wallet.address);
}

async function createOrder(appOffer: AppOffer, user: User, userDeviceId: string, orderTranslations = {} as OrderTranslations) {
	const wallet = (await user.getWallets(userDeviceId)).lastUsed();
	if (!wallet) {
		throw UserHasNoWallet(user.id, userDeviceId);
	}

	const app = (await Application.findOneById(user.appId))!;
	if (appOffer.offer.type === "earn") {
		await assertRateLimitAppEarn(app.id, app.config.limits.minute_total_earn, moment.duration({ minutes: 1 }), appOffer.offer.amount);
		await assertRateLimitAppEarn(app.id, app.config.limits.hourly_total_earn, moment.duration({ hours: 1 }), appOffer.offer.amount);
		await assertRateLimitUserEarn(user.id, app.config.limits.daily_user_earn, moment.duration({ days: 1 }), appOffer.offer.amount);
		await assertRateLimitWalletEarn(wallet.address, app.config.limits.daily_user_earn, moment.duration({ days: 1 }), appOffer.offer.amount);
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
			sender_address: appOffer.offer.type === "spend" ? wallet.address : appOffer.walletAddress,
			recipient_address: appOffer.offer.type === "spend" ? appOffer.walletAddress : wallet.address
		}
	}, {
		user,
		wallet: wallet.address,
		type: appOffer.offer.type,
		// TODO if order meta content is a template:
		// replaceTemplateVars(offer, offer.meta.order_meta.content!)
		meta: orderMeta
	});
	await order.save();

	metrics.createOrder("marketplace", appOffer.offer.type, appOffer.offer.id, user.appId);

	return order;
}

export async function createMarketplaceOrder(offerId: string, user: User, userDeviceId: string, orderTranslations?: OrderTranslations): Promise<OpenOrder> {
	logger().info("creating marketplace order for", { offerId, userId: user.id });

	const appOffer = await AppOffer.findOne({ offerId, appId: user.appId });
	if (!appOffer) {
		throw NoSuchOffer(offerId);
	}

	const order = await lock(getLockResource("get", offerId, user.id), async () =>
		(await db.Order.getOpenOrder(offerId, user.id)) ||
		(await lock(getLockResource("create", offerId), () => createOrder(appOffer, user, userDeviceId, orderTranslations)))
	);

	if (!order) {
		throw OfferCapReached(offerId);
	}

	logger().info("created new open marketplace order", order);

	return openOrderDbToApi(order, user.id);
}

async function createP2PExternalOrder(sender: User, senderDeviceId: string, jwt: ExternalPayToUserOrderJWT): Promise<db.ExternalOrder> {
	const senderWallet = (await sender.getWallets(senderDeviceId)).lastUsed();
	if (!senderWallet) {
		throw UserHasNoWallet(sender.id, senderDeviceId);
	}

	const recipient = await User.findOne({ appId: sender.appId, appUserId: jwt.recipient.user_id });
	if (!recipient) {
		throw NoSuchUser(jwt.recipient.user_id);
	}

	const recipientWallet = (await recipient.getWallets()).lastUsed();
	if (!recipientWallet) {
		throw UserHasNoWallet(recipient.id);
	}

	const order = db.ExternalOrder.new({
		offerId: jwt.offer.id,
		amount: jwt.offer.amount,
		status: "opened",
		nonce: jwt.nonce,
		blockchainData: {
			sender_address: senderWallet.address,
			recipient_address: recipientWallet.address
		}
	}, {
		type: "earn",
		user: recipient,
		wallet: recipientWallet.address,
		meta: pick(jwt.recipient, "title", "description")
	}, {
		user: sender,
		type: "spend",
		wallet: senderWallet.address,
		meta: pick(jwt.sender, "title", "description")
	});

	await addWatcherEndpoint(recipientWallet.address, order.id);
	return order;
}

async function createNormalEarnExternalOrder(recipient: User, recipientDeviceId: string, jwt: ExternalEarnOrderJWT) {
	const app = (await Application.findOneById(recipient.appId))!;
	if (!app) {
		throw NoSuchApp(recipient.appId);
	}

	await assertRateLimitUserEarn(recipient.id, app.config.limits.daily_user_earn, moment.duration({ days: 1 }), jwt.offer.amount);

	const wallet = (await recipient.getWallets(recipientDeviceId)).lastUsed();
	if (!wallet) {
		throw UserHasNoWallet(recipient.id, recipientDeviceId);
	}
	await assertRateLimitWalletEarn(wallet.address, app.config.limits.daily_user_earn, moment.duration({ days: 1 }), jwt.offer.amount);

	return db.ExternalOrder.new({
		offerId: jwt.offer.id,
		amount: jwt.offer.amount,
		nonce: jwt.nonce,
		status: "opened",
		blockchainData: {
			sender_address: app.walletAddresses.sender,
			recipient_address: wallet.address
		}
	}, {
		type: "earn",
		user: recipient,
		wallet: wallet.address,
		meta: pick(jwt.recipient, "title", "description")
	});
}

async function createNormalSpendExternalOrder(sender: User, senderDeviceId: string, jwt: ExternalSpendOrderJWT) {
	const app = await Application.findOneById(sender.appId);

	if (!app) {
		throw NoSuchApp(sender.appId);
	}

	const wallet = (await sender.getWallets(senderDeviceId)).lastUsed();
	if (!wallet) {
		throw UserHasNoWallet(sender.id, senderDeviceId);
	}

	const order = db.ExternalOrder.new({
		offerId: jwt.offer.id,
		amount: jwt.offer.amount,
		status: "opened",
		nonce: jwt.nonce,
		blockchainData: {
			sender_address: wallet.address,
			recipient_address: app.walletAddresses.recipient
		}
	}, {
		user: sender,
		type: "spend",
		wallet: wallet.address,
		meta: pick(jwt.sender, "title", "description")
	});

	await addWatcherEndpoint(app.walletAddresses.recipient, order.id);

	return order;
}

export async function createExternalOrder(jwt: string, user: User, userDeviceId: string): Promise<OpenOrder> {
	logger().info("createExternalOrder", { jwt });
	const payload = await validateExternalOrderJWT(jwt, user.appUserId, userDeviceId);
	const nonce = payload.nonce || db.Order.DEFAULT_NONCE;

	const orders = await db.Order.getAll({ offerId: payload.offer.id, userId: user.id, nonce });
	let order = orders.length > 0 ? orders[0] : undefined;

	if (!order || order.status === "failed") {
		if (isPayToUser(payload)) {
			order = await createP2PExternalOrder(user, userDeviceId, payload);
		} else if (isExternalEarn(payload)) {
			order = await createNormalEarnExternalOrder(user, userDeviceId, payload);
		} else {
			order = await createNormalSpendExternalOrder(user, userDeviceId, payload);
		}

		await order.save();

		metrics.createOrder("external", order.flowType(), "native", user.appId);

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
	user: User,
	userDeviceId: string,
	form: string | undefined,
	acceptsLanguagesFunc?: ExpressRequest["acceptsLanguages"]): Promise<Order> {

	logger().info("submitOrder", { orderId });
	const order = await db.Order.getOne({ orderId });
	const wallet = (await user.getWallets(userDeviceId)).lastUsed();
	if (!wallet) {
		throw UserHasNoWallet(user.id, userDeviceId);
	}

	if (!order || order.contextForUser(user.id) === null) {
		throw NoSuchOrder(orderId);
	}
	if (order.status !== "opened") {
		return await orderDbToApi(order, user.id, wallet.address);
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
					logger().warn(`unexpected content type ${ offerContent.contentType }`);
			}
		}
	}

	order.setStatus("pending");
	await order.save();
	logger().info("order changed to pending", { orderId });

	if (order.isEarn()) {
		await payment.payTo(wallet.address, user.appId, order.amount, order.id);
		createEarnTransactionBroadcastToBlockchainSubmitted(order.contexts[0].user.id, order.offerId, order.id).report();
	}

	metrics.submitOrder(order.origin, order.flowType(), user.appId);
	return await orderDbToApi(order, user.id, wallet.address);
}

export async function cancelOrder(orderId: string, userId: string): Promise<void> {
	// you can only delete an open order - not a pending order
	const order = await db.Order.getOne({ orderId, status: "opened" });
	if (!order || order.contextForUser(userId) === null) {
		throw NoSuchOrder(orderId);
	}

	await order.remove();
}

export async function getOrderHistory(
	user: User,
	deviceId: string,
	filters: { origin?: db.OrderOrigin; offerId?: string; },
	limit: number = 25,
	before?: string,
	after?: string): Promise<OrderList> {

	// XXX use the cursor input values
	const status: db.OrderStatusAndNegation = "!opened";
	const wallet = (await user.getWallets(deviceId)).lastUsed();
	if (!wallet) {
		throw UserHasNoWallet(user.id, deviceId);
	}

	const orders = await db.Order.getAll({
		...filters,
		status,
		walletAddress: wallet.address
	}, limit);

	return {
		orders: await Promise.all(orders.map(async order => {
			checkIfTimedOut(order); // no need to wait for the promise
			return await orderDbToApi(order, user.id, wallet.address);
		})),
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

	const context = order.contextForUser(userId)!;
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

async function orderDbToApi(order: db.Order, userId: string, wallet: string): Promise<Order> {
	if (order.status === "opened") {
		throw OpenedOrdersUnreturnable();
	}

	const apiOrder = Object.assign(
		pick(order, "id", "origin", "status", "amount"), {
			result: order.value,
			offer_id: order.offerId,
			error: order.error as ApiError,
			blockchain_data: order.blockchainData,
			completion_date: (order.currentStatusDate || order.createdDate).toISOString()
		}) as Order;

	const data: any = {};
	let context = order.contextForUser(userId)!;
	if (context) {
		Object.assign(data, {
			offer_type: context.type,
		}, pick(context.meta, "title", "description", "content", "call_to_action"));
	} else {
		context = order.contextForWallet(wallet)!;
		const app = (await Application.findOneById(context.user.appId))!;  // TODO This is run inside a for loop - better remove this

		Object.assign(data, {
			offer_type: context.type,
		}, pick(context.meta, "title", "description", "content", "call_to_action"));
		data.title = capitalizeFirstLetter(context.type) + " transaction in " + app.name;
		data.description = "The transaction was created in a different app or by a different user using the same wallet";
	}

	return Object.assign({}, apiOrder, data);
}

export async function setFailedOrder(order: db.Order, error: MarketplaceError, failureDate?: Date): Promise<db.Order> {
	order.setStatus("failed");
	order.currentStatusDate = failureDate || order.currentStatusDate;
	order.error = error.toJson();

	metrics.orderFailed(order);

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
