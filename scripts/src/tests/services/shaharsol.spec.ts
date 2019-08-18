// import * as moment from "moment";
// import * as jsonwebtoken from "jsonwebtoken";
//
// import { app } from "../../public/app";
// import * as metrics from "../..//metrics";
// import { initLogger } from "../../logging";
// import { JWTContent } from "../../public/jwt";
// import { localCache } from "../../utils/cache";
// import { AuthToken, User } from "../../models/users";
// import { JWTValue, Offer } from "../../models/offers";
// import { ExternalOrder, Order } from "../../models/orders";
// import { Application, AppOffer } from "../../models/applications";
// import { TransactionTimeout, UserHasNoWallet } from "../../errors";
// import { getOffers, Offer as OfferData } from "../../public/services/offers";
// import { close as closeModels, init as initModels } from "../../models/index";
// import { generateId, IdPrefix, random, randomInteger, generateRandomString } from "../../utils/utils";
// import {
// 	changeOrder,
// 	createMarketplaceOrder,
// 	getOrder,
// 	getOrderHistory,
// 	Order as OrderData,
// 	OrderList,
// 	setFailedOrder,
// 	submitOrder,
// 	createIncomingTransferOrder
// } from "../../public/services/orders";
//
// import * as helpers from "../helpers";
// import mock = require("supertest");
// import { createApp } from "../helpers";
//
// async function completeOrder(user: User, deviceId: string) {
// 	const offers = await getOffers(user.id, user.appId, {});
// 	const offerId = offers.offers[0].id;
// 	const openOrder = await createMarketplaceOrder(offerId, user, deviceId);
// 	const order = await submitOrder(openOrder.id, user, deviceId, "{}");
// 	await helpers.completePayment(order.id);
// 	return order;
// }
//
// describe("test v2 orders", async () => {
// 	jest.setTimeout(20000);
//
// 	beforeEach(async done => {
// 		initLogger();
// 		await initModels();
// 		// await helpers.clearDatabase();
// 		await helpers.createOffers();
// 		helpers.patchDependencies();
//
// 		localCache.clear();
// 		done();
// 	});
//
// 	afterEach(async done => {
// 		await closeModels();
// 		await metrics.destruct();
// 		done();
// 	});
//
// 	async function getHistory(token: AuthToken) {
// 		return (await mock(app)
// 			.get("/v2/orders")
// 			.set("x-request-id", "123")
// 			.set("Authorization", `Bearer ${ token.id }`)).body.orders as OrderData[];
// 	}
//
// 	type CreateOrdersOptions = {
// 		divideBy?: number;
// 		offers?: OfferData[];
// 	};
//
// 	async function createOrdersForUser(user: User, deviceId: string, app: Application, options: CreateOrdersOptions = {}) {
// 		const offers = options.offers || (await getOffers(user.id, app.id, {})).offers;
// 		const earns = offers.filter(o => o.offer_type === "earn");
// 		const spends = offers.filter(o => o.offer_type === "spend");
//
// 		const earnsCount = randomInteger(1, earns.length > 2 && options.divideBy ? earns.length / options.divideBy : earns.length);
// 		const spendsCount = randomInteger(1, spends.length > 2 && options.divideBy ? spends.length / options.divideBy : spends.length);
// 		const orders = [] as string[];
// 		let balance = 0;
//
// 		for (let i = 0; i < earnsCount; i++) {
// 			const offer = earns[i];
// 			balance += offer.amount;
//
// 			const openOrder = await createMarketplaceOrder(offer.id, user, deviceId);
// 			const order = await submitOrder(openOrder.id, user, deviceId, "{}");
// 			await helpers.completePayment(order.id);
//
// 			orders.push(order.id);
// 		}
//
// 		for (let i = 0; i < spendsCount; i++) {
// 			const offer = spends[i];
//
// 			if (balance - offer.amount <= 0) {
// 				continue;
// 			}
//
// 			balance -= offer.amount;
//
// 			const openOrder = await createMarketplaceOrder(offer.id, user, deviceId);
// 			const order = await submitOrder(openOrder.id, user, deviceId, "{}");
// 			await helpers.completePayment(order.id);
//
// 			orders.push(order.id);
// 		}
//
// 		return orders;
// 	}
//
// 	// test("create a cross-app order shaharsol", async () => {
// 	// 	const senderApp = await helpers.createApp("sender-app");
// 	// 	const receiverApp = await helpers.createApp("receiver-app");
// 	// 	const deviceId1 = `device_${ generateId() }`;
// 	// 	const sender = await helpers.createUser({ deviceId: deviceId1, appId: senderApp.id, createWallet: false });
// 	// 	const receiver = await helpers.createUser({ deviceId: deviceId1, appId: receiverApp.id, createWallet: false });
// 	// 	const senderWalletAddress = `wallet-${ generateRandomString({ prefix: sender.id, length: 56 }) }`;
// 	// 	const receiverWalletAddress = `wallet-${ generateRandomString({ prefix: receiver.id, length: 56 }) }`;
// 	// 	await sender.updateWallet(deviceId1, senderWalletAddress);
// 	// 	await receiver.updateWallet(deviceId1, receiverWalletAddress);
// 	// 	// const token1 = (await AuthToken.findOne({ userId: user.id }))!;
// 	// 	const order = await createOutgoingTransferOrder(receiverWalletAddress, receiverApp.id, 'a title', 'a description', 'a memo' , 1000, sender, deviceId1);
// 	// 	const util = require('util')
// 	// 	console.log('order is %s',util.inspect(order))
// 	// 	// expect(order).toBeTruthy();
// 	// 	expect(order).toMatchObject({amount: 1000})
// 	//
// 	// })
//
// 	test("create an incoming transfer order shaharsol", async () => {
// 		const senderApp = await helpers.createApp("sender-app");
// 		const receiverApp = await helpers.createApp("receiver-app");
// 		const deviceId1 = `device_${ generateId() }`;
// 		const sender = await helpers.createUser({ deviceId: deviceId1, appId: senderApp.id, createWallet: false });
// 		const receiver = await helpers.createUser({ deviceId: deviceId1, appId: receiverApp.id, createWallet: false });
// 		const senderWalletAddress = `wallet-${ generateRandomString({ prefix: sender.id, length: 56 }) }`;
// 		const receiverWalletAddress = `wallet-${ generateRandomString({ prefix: receiver.id, length: 56 }) }`;
// 		await sender.updateWallet(deviceId1, senderWalletAddress);
// 		await receiver.updateWallet(deviceId1, receiverWalletAddress);
// 		const order = await createIncomingTransferOrder("a title", "a description", "a memo", senderWalletAddress, senderApp.id,  receiver, deviceId1);
// 		expect(order).toMatchObject({ title: "a title" });
// 	});
//
// 	// test("e2e of create cross-app order shaharsol", async () => {
// 	//
// 	// 	const senderApp = await helpers.createApp("sender-app");
// 	// 	const receiverApp = await helpers.createApp("receiver-app");
// 	// 	const deviceId1 = `device_${ generateId() }`;
// 	// 	const senderWalletAddress = `wallet-${ generateId() }`;
// 	// 	const receiverWalletAddress = `wallet-${ generateId() }`;
// 	// 	const sender = await helpers.createUser({ deviceId: deviceId1, appId: senderApp.id, createWallet: false });
// 	// 	const receiver = await helpers.createUser({ deviceId: deviceId1, appId: receiverApp.id, createWallet: false });
// 	// 	await sender.updateWallet(deviceId1, senderWalletAddress);
// 	// 	await receiver.updateWallet(deviceId1, receiverWalletAddress);
// 	// 	const token: AuthToken = (await AuthToken.findOne({ userId: sender.id }))!;
// 	//
// 	// 	await mock(app)
// 	// 		.post(`/v2/offers/cross-app/orders`)
// 	// 		.send({
// 	// 			wallet_address: receiverWalletAddress,
// 	// 			app_id: senderApp.id,
// 	// 			title: 'a title',
// 	// 			description: 'a description',
// 	// 			amount: 1000
// 	// 		})
// 	// 		.set("x-request-id", "123")
// 	// 		.set("x-sdk-version", "123")
// 	// 		.set("x-device-model", "123")
// 	// 		.set("x-device-manufacturer", "123")
// 	// 		.set("x-device-id", "123")
// 	// 		.set("x-os", "123")
// 	// 		.set("Authorization", `Bearer ${ token.id }`)
// 	// 		.expect(200);
// 	//
// 	// })
// });
