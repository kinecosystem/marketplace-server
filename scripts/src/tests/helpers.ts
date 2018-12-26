import * as path from "path";
import * as jsonwebtoken from "jsonwebtoken";
import * as moment from "moment";
import { getManager } from "typeorm";
import * as StellarSdk from "stellar-sdk";

import { generateId, readKeysDir, random } from "../utils/utils";
import { Asset, Offer } from "../models/offers";
import { User, AuthToken } from "../models/users";
import { Application, ApplicationConfig, StringMap } from "../models/applications";
import { LimitConfig } from "../config";
import { createEarn, createSpend } from "../create_data/offers";
import { Poll, PageType } from "../public/services/offer_contents";
import { CompletedPayment, paymentComplete } from "../internal/services";
import { ExternalOrder, MarketplaceOrder, Order, P2POrder } from "../models/orders";
import * as payment from "../public/services/payment";
import { Event } from "../analytics";
import { getConfig } from "../internal/config";

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

export async function createUser(options: { appId?: string; deviceId?: string; createWallet?: boolean } = {}): Promise<User> {
	const uniqueId = generateId();
	const deviceId = options.deviceId || `test_device_${ uniqueId }`;
	const userData = {
		appUserId: `test_user_${ uniqueId }`,
		appId: options.appId || (await Application.findOne())!.id
	} as User;

	const user = await (User.new(Object.assign(userData, { isNew: true }))).save();
	if (options.createWallet === undefined || options.createWallet) {
		await user.updateWallet(deviceId, `test_wallet_${ uniqueId }`);
	}

	await (AuthToken.new({
		deviceId,
		userId: user.id
	})).save();

	return user;
}

async function orderFromOffer(offer: Offer, userId: string): Promise<MarketplaceOrder> {
	const user = (await User.findOneById(userId))!;
	const wallet = (await user.getWallets()).all()[0];

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
		wallet: wallet.address,
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

export async function createExternalOrder(userId: string): Promise<Order> {
	const user = (await User.findOneById(userId))!;
	const wallet = (await user.getWallets()).all()[0];

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
		wallet: wallet.address,
		meta: {
			title: "external order #1",
			description: "first external order"
		}
	});
	await order.save();

	return order;
}

export async function createP2POrder(userId: string): Promise<Order> {
	const sender = await User.findOneById(userId);
	const recipient = await createUser();

	const order = P2POrder.new({
		amount: 65,
		status: "pending",
		offerId: "p2p offer example",
		blockchainData: {
			transaction_id: "A123123123123123",
			recipient_address: "G123123123123",
			sender_address: "G123123123123"
		}
	}, {
		user: sender,
		type: "earn",
		meta: {
			title: "p2p order #1",
			description: "first p2p order"
		}
	}, {
		user: recipient,
		type: "spend",
		meta: {
			title: "p2p order #2",
			description: "first p2p order"
		}
	});
	await order.save();

	return order;
}

export async function createOffers() {
	const uniqueId = generateId();

	for (let i = 0; i < 5; i += 1) {
		await createEarn(
			`${ uniqueId }_earn${ i }`,
			"GBOQY4LENMPZGBROR7PE5U3UXMK22OTUBCUISVEQ6XOQ2UDPLELIEC4J",
			`earn${ i }`, `earn${ i }`, `earn${ i }`, `earn${ i }`, 100, 30, 1, `earn${ i }`, `earn${ i }`, "poll", animalPoll, ["ALL"]
		);
	}

	for (let i = 0; i < 5; i += 1) {
		await createSpend(
			`${ uniqueId }_spend${ i }`,
			"GBOQY4LENMPZGBROR7PE5U3UXMK22OTUBCUISVEQ6XOQ2UDPLELIEC4J",
			`spend${ i }`, `spend${ i }`, `spend${ i }`, `spend${ i }`, 100, 30, 3, `spend${ i }`, `spend${ i }`,
			`spend${ i }`, `spend${ i }`, `spend${ i }`, `spend${ i }`, `spend${ i }`, `spend${ i }`,
			`spend${ i }`, `spend${ i }`, `spend${ i }`, `spend${ i }`, `spend${ i }`,
			[`spend${ i }_1`, `spend${ i }_2`, `spend${ i }_3`, `spend${ i }_4`, `spend${ i }_5`], ["ALL"]
		);
	}
}

export async function completePayment(orderId: string) {
	const order = (await Order.getOne({ orderId }))!;
	const user = order.contexts[0].user;
	const payment: CompletedPayment = {
		id: order.id,
		app_id: user.appId,
		transaction_id: "fake:" + order.id,
		recipient_address: order.blockchainData.recipient_address!,
		sender_address: order.blockchainData.sender_address!,
		amount: order.amount,
		timestamp: (new Date()).toISOString()
	};
	await paymentComplete(payment);
}

/**
 * the order of the tables here matters.
 * the `clearDatabase` function deletes the content of the tables in this list by this order.
 * if the order is incorrect, a sql constraint error will be thrown.
 */
const TABLES = [
	"application_offers",
	"user_wallets",
	"orders_contexts",
	"orders",
	"offers",
	"users",
	"assets",
	"auth_tokens",
];

export async function clearDatabase() {
	let tableName!: string;

	try { // TODO: get this list dynamically
		for (tableName of TABLES) {
			await getManager().query(`DELETE FROM ${ tableName };`);
		}
	} catch (error) {
		throw new Error(`ERROR: Cleaning test db (table: "${ tableName }"): ${ error }`);
	}
}

const CONFIG = getConfig();
const PRIVATE_KEYS = readKeysDir(path.join(CONFIG.jwt_keys_dir, "private_keys"));
const PUBLIC_KEYS = readKeysDir(path.join(CONFIG.jwt_keys_dir, "public_keys"));

export async function signJwt(appId: string, subject: string, payload: object) {
	const keyid = random(Object.keys(PRIVATE_KEYS));
	const signWith = PRIVATE_KEYS[keyid];
	return jsonwebtoken.sign(payload, signWith.key, {
		subject,
		keyid,
		issuer: appId,
		algorithm: signWith.algorithm,
		expiresIn: moment().add(6, "hours").unix()
	});
}

export async function createApp(appId: string, limits?: LimitConfig): Promise<Application> {
	const address = getKeyPair().public;
	const appConfig: ApplicationConfig = {
		max_user_wallets: null,
		sign_in_types: ["jwt", "whitelist"],
		daily_earn_offers: 4,
		limits: {
			hourly_registration: 200000,
			minute_registration: 10000,
			hourly_total_earn: 5000000,
			minute_total_earn: 85000,
			daily_user_earn: 5000
		}
	};
	if (limits) { // for RateLimits tests passed limits has low value
		appConfig.limits = limits;
	}
	// all apps created during tests will have the same keys
	const jwtPublicKeys: StringMap = {};
	for (const key of Object.keys(PUBLIC_KEYS)) {
		jwtPublicKeys[key] = PUBLIC_KEYS[key].key;
	}
	const app = Application.new({
		id: appId,
		name: appId,
		jwtPublicKeys,
		walletAddresses: { recipient: address, sender: address },
		config: appConfig
	});
	await app.save();
	return app;
}

export function getKeyPair(): { private: string, public: string } {
	const keypair = StellarSdk.Keypair.random();
	return { public: keypair.publicKey(), private: keypair.secret() };
}

export function patchDependencies() {
	(payment.payTo as any) = () => 1; // XXX use a patching library
	(payment.getBlockchainConfig as any) = () => 1; // XXX use a patching library
	(payment.setWatcherEndpoint as any) = () => 1; // XXX use a patching library
	(payment.createWallet as any) = () => 1; // XXX use a patching library
	Event.prototype.report = () => Promise.resolve();
}
