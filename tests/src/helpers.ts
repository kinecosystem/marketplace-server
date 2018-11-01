import { getManager } from "typeorm";
import * as StellarSdk from "stellar-sdk";

import { generateId } from "../../scripts/bin/utils";
import { getDefaultLogger } from "../../scripts/bin/logging";
import { Asset, Offer } from "../../scripts/bin/models/offers";
import { User, AuthToken } from "../../scripts/bin/models/users";
import { Application } from "../../scripts/bin/models/applications";
import { createEarn, createSpend } from "../../scripts/bin/create_data/offers";
import { Poll, PageType } from "../../scripts/bin/public/services/offer_contents";
import { CompletedPayment, paymentComplete } from "../../scripts/bin/internal/services";
import { MarketplaceOrder, ExternalOrder, Order, OrderContext } from "../../scripts/bin/models/orders";

const animalPoll: Poll = {
	pages: [{
		type: PageType.FullPageMultiChoice,
		title: "Whats your favourite animal?",
		description: "Who doesn't love animals!?",
		question: {
			id: "favourite_animal",
			answers: ["dog", "cat", "monkey", "mouse"],
		},
	}],
};

export async function createUser(options: { appId?: string } = {}): Promise<User> {
	const uniqueId = generateId();
	const userData = {
		appUserId: `test_${uniqueId}`,
		appId: options.appId || (await Application.findOne())!.id,
		walletAddress: `test_${uniqueId}`
	} as User;

	const user = await (User.new(userData)).save();

	const authToken = await (AuthToken.new({
		userId: user.id,
		deviceId: `test_${uniqueId}`
	})).save();

	return user;
}

async function orderFromOffer(offer: Offer, userId: string): Promise<MarketplaceOrder> {
	const user = await User.findOneById(userId);
	return MarketplaceOrder.new({
		offerId: offer.id,
		amount: offer.amount,
		status: "pending",
		blockchainData: {
			transaction_id: "A123123123123123",
			recipient_address: "G123123123123",
			sender_address: "G123123123123"
		}
	}, {
		user,
		type: offer.type,
		meta: offer.meta.order_meta
	}) as MarketplaceOrder;
}

export async function createOrders(userId: string): Promise<number> {
	let offers = await Offer.find({ where: { type: "spend" }, take: 3 });

	let order = await orderFromOffer(offers[0], userId);
	order.status = "completed";
	const asset: Asset = (await Asset.find({ where: { offerId: order.offerId, ownerId: null }, take: 1 }))[0];
	order.value = asset.asOrderValue(); // {coupon_code: 'xxxxxx', type: 'coupon'}
	await order.save();

	order = await orderFromOffer(offers[1], userId);
	order.status = "failed";
	order.error = { message: "transaction timed out", error: "timeout", code: 4081 };
	await order.save();

	order = await orderFromOffer(offers[2], userId);
	order.status = "pending";
	await order.save();

	offers = await Offer.find({ where: { type: "earn" }, take: 3 });
	order = await orderFromOffer(offers[0], userId);
	order.status = "completed";
	await order.save();

	order = await orderFromOffer(offers[1], userId);
	order.status = "failed";
	order.error = { message: "transaction timed out", error: "timeout", code: 4081 };
	await order.save();

	order = await orderFromOffer(offers[2], userId);
	order.status = "pending";
	await order.save();

	return 6;
}

export async function createExternalOrders(userId: string): Promise<number> {
	const user = await User.findOneById(userId);
	const order = ExternalOrder.new({
		amount: 65,
		status: "pending",
		offerId: "external1",
		blockchainData: {
			transaction_id: "A123123123123123",
			recipient_address: "G123123123123",
			sender_address: "G123123123123"
		}
	}, {
		user,
		type: "earn",
		meta: {
			title: "external order #1",
			description: "first external order"
		}
	});
	await order.save();

	return 1;
}

export async function createOffers() {
	const uniqueId = generateId();

	for (let i = 0; i < 5; i += 1) {
		await createEarn(
			`${uniqueId}_earn${i}`,
			"GBOQY4LENMPZGBROR7PE5U3UXMK22OTUBCUISVEQ6XOQ2UDPLELIEC4J",
			`earn${i}`, `earn${i}`, `earn${i}`, `earn${i}`, 100, 30, 1, `earn${i}`, `earn${i}`, "poll", animalPoll
		);
	}

	for (let i = 0; i < 5; i += 1) {
		await createSpend(
			`${uniqueId}_spend${i}`,
			"GBOQY4LENMPZGBROR7PE5U3UXMK22OTUBCUISVEQ6XOQ2UDPLELIEC4J",
			`spend${i}`, `spend${i}`, `spend${i}`, `spend${i}`, 100, 30, 3, `spend${i}`, `spend${i}`,
			`spend${i}`, `spend${i}`, `spend${i}`, `spend${i}`, `spend${i}`, `spend${i}`,
			`spend${i}`, `spend${i}`, `spend${i}`, `spend${i}`, `spend${i}`,
			[`spend${i}_1`, `spend${i}_2`, `spend${i}_3`, `spend${i}_4`, `spend${i}_5`]
		);
	}
}

export async function completePayment(orderId: string) {
	const order = await Order.getOne(orderId);
	const user = order.contexts[0].user;
	const payment: CompletedPayment = {
		id: order.id,
		app_id: user.appId,
		transaction_id: "fake:" + order.id,
		recipient_address: order.blockchainData.recipient_address,
		sender_address: order.blockchainData.sender_address,
		amount: order.amount,
		timestamp: (new Date()).toISOString()
	};
	await paymentComplete(payment, getDefaultLogger());
}

const TABLES = ["application_offers", "orders_contexts", "orders", "offers", "users", "assets", "auth_tokens"];
export async function clearDatabase() {
	try { // TODO: get this list dynamically
		for (const tableName of TABLES) {
			await getManager().query(`DELETE FROM ${tableName};`);
		}
	} catch (error) {
		throw new Error(`ERROR: Cleaning test db: ${error}`);
	}
}

export async function createApp(appId: string): Promise<Application> {
	const address = StellarSdk.Keypair.random().publicKey();
	const app = Application.new({
		id: appId,
		name: appId,
		jwtPublicKeys: {},
		walletAddresses: { recipient: address, sender: address },
		config: { max_user_wallets: null, sign_in_types: ["jwt", "whitelist"] }
	});
	await app.save();
	return app;
}
