import * as moment from "moment";
import mock = require("supertest");
import * as jsonwebtoken from "jsonwebtoken";

import { app } from "../../public/app";
import * as metrics from "../..//metrics";
import { initLogger } from "../../logging";
import { JWTContent } from "../../public/jwt";
import { localCache } from "../../utils/cache";
import { AuthToken, User } from "../../models/users";
import { JWTValue, Offer } from "../../models/offers";
import { ExternalOrder, Order } from "../../models/orders";
import { Application, AppOffer } from "../../models/applications";
import { TransactionTimeout, UserHasNoWallet } from "../../errors";
import { getOffers, Offer as OfferData } from "../../public/services/offers";
import { close as closeModels, init as initModels } from "../../models/index";
import { generateId, random, randomInteger, IdPrefix } from "../../utils/utils";
import {
	changeOrder,
	createMarketplaceOrder,
	getOrder,
	getOrderHistory,
	setFailedOrder,
	submitOrder, OrderList,
	Order as OrderData
} from "../../public/services/orders";

import * as helpers from "../helpers";

async function completeOrder(user: User, deviceId: string) {
	const offers = await getOffers(user.id, user.appId, {});
	const offerId = offers.offers[0].id;
	const openOrder = await createMarketplaceOrder(offerId, user, deviceId);
	const order = await submitOrder(openOrder.id, user, deviceId, "{}");
	await helpers.completePayment(order.id);
	return order;
}

describe("test orders", async () => {
	jest.setTimeout(20000);

	beforeAll(async done => {
		initLogger();
		await initModels();
		await helpers.clearDatabase();
		await helpers.createOffers();
		helpers.patchDependencies();

		localCache.clear();
		done();
	});

	afterAll(async done => {
		await closeModels();
		await metrics.destruct();
		done();
	});

	async function getHistory(token: AuthToken) {
		return (await mock(app)
			.get("/v2/orders")
			.set("x-request-id", "123")
			.set("Authorization", `Bearer ${ token.id }`)).body.orders as OrderData[];
	}

	type CreateOrdersOptions = {
		divideBy?: number;
		offers?: OfferData[];
	};

	async function createOrdersForUser(user: User, deviceId: string, app: Application, options: CreateOrdersOptions = {}) {
		const offers = options.offers || (await getOffers(user.id, app.id, {})).offers;
		const earns = offers.filter(o => o.offer_type === "earn");
		const spends = offers.filter(o => o.offer_type === "spend");

		const earnsCount = randomInteger(1, earns.length > 2 && options.divideBy ? earns.length / options.divideBy : earns.length);
		const spendsCount = randomInteger(1, spends.length > 2 && options.divideBy ? spends.length / options.divideBy : spends.length);
		const orders = [] as string[];
		let balance = 0;

		for (let i = 0; i < earnsCount; i++) {
			const offer = earns[i];
			balance += offer.amount;

			const openOrder = await createMarketplaceOrder(offer.id, user, deviceId);
			const order = await submitOrder(openOrder.id, user, deviceId, "{}");
			await helpers.completePayment(order.id);

			orders.push(order.id);
		}

		for (let i = 0; i < spendsCount; i++) {
			const offer = spends[i];

			if (balance - offer.amount <= 0) {
				continue;
			}

			balance -= offer.amount;

			const openOrder = await createMarketplaceOrder(offer.id, user, deviceId);
			const order = await submitOrder(openOrder.id, user, deviceId, "{}");
			await helpers.completePayment(order.id);

			orders.push(order.id);
		}

		/*for (let i = 0; i < earnsCount + spendsCount; i++) {
			let offer: OfferData;

			if (i < earnsCount) {
				offer = earns[i];
			} else {
				offer = spends[i - earnsCount];
			}

			if (offer.offer_type === "spend" && balance - offer.amount <= 0) {
				continue;
			} else if (offer.offer_type === "spend") {
				balance -= offer.amount;
			} else {
				balance += offer.amount;
			}

			const openOrder = await createMarketplaceOrder(offer.id, user, deviceId);
			const order = await submitOrder(openOrder.id, user, deviceId, "{}");
			await helpers.completePayment(order.id);

			orders.push(order.id);
		}*/

		return orders;
	}

	test("getAll and filters", async () => {
		const user = await helpers.createUser({ deviceId: "test_device_id" });
		const count = await helpers.createOrders(user.id);

		let orders = await Order.getAll({ userId: user.id, status: "!opened" }, 25);
		expect(orders.length).toBe(count);
		expect(orders.length).toBe(orders.filter(o => o.status !== "opened").length);

		const offers = new Map<string, number>();
		(await Order.getAll({ userId: user.id })).forEach(order => {
			offers.set(order.offerId, offers.has(order.offerId) ? offers.get(order.offerId)! + 1 : 1);
		});

		const [offerId, ordersCount] = random(offers);
		orders = await Order.getAll({ userId: user.id, offerId }, 25);
		expect(orders.length).toBe(ordersCount);

		await helpers.createExternalOrder(user.id);
		orders = await Order.getAll({ userId: user.id, origin: "external" }, 25);
		expect(orders.length).toBe(1);
	});

	test("offer list returns an offer with my open order", async () => {
		const deviceId = "test_device_id";
		const user = await helpers.createUser({ deviceId });
		const offers = await getOffers(user.id, user.appId, {});
		const offer = offers.offers.find(x => x.offer_type === "earn");

		if (!offer) {
			throw Error("failed to find earn order");
		}

		const order = await createMarketplaceOrder(offer.id, user, deviceId);

		const offers2 = await getOffers(user.id, user.appId, {});
		const foundOffer = offers2.offers.find(x => x.id === offer.id);

		expect(foundOffer).toBeTruthy();
	});

	test("getOrderHistory returns only orders for current wallet", async () => {
		const deviceId = "test_device_id";
		const user = await helpers.createUser({ deviceId });
		const offers = await getOffers(user.id, user.appId, {});
		const firstIteration = Math.floor(offers.offers.length / 2);

		for (let i = 0; i < firstIteration; i++) {
			const offerId = offers.offers[i].id;
			const openOrder = await createMarketplaceOrder(offerId, user, deviceId);
			const order = await submitOrder(openOrder.id, user, deviceId, "{}");
			await helpers.completePayment(order.id);
		}

		const history1 = (await getOrderHistory(user, deviceId, {})).orders.map(order => order.id);
		await user.updateWallet(deviceId, `wallet-${ generateId() }`);

		for (let i = firstIteration; i < offers.offers.length; i++) {
			const offerId = offers.offers[i].id;
			const openOrder = await createMarketplaceOrder(offerId, user, deviceId);
			const order = await submitOrder(openOrder.id, user, deviceId, "{}");
			await helpers.completePayment(order.id);
		}

		const history2 = (await getOrderHistory(user, deviceId, {})).orders.map(order => order.id);
		expect(history1.length + history2.length).toBe(offers.offers.length);
		history1.forEach(id => expect(history2).not.toContain(id));
	});

	test("filter order by offer_id", async () => {
		const deviceId = "test_device_id";
		const user = await helpers.createUser({ deviceId });
		const offers = await getOffers(user.id, user.appId, {});
		for (let i = 0; i < offers.offers.length && i < 4; i++) {
			const offerId = offers.offers[i].id;
			const openOrder = await createMarketplaceOrder(offerId, user, deviceId);
			const order = await submitOrder(openOrder.id, user, deviceId, "{}");
			await helpers.completePayment(order.id);
		}

		const offerId = offers.offers[0].id;
		const history = await getOrderHistory(user, deviceId, { offerId });
		expect(history.orders.length).toEqual(1);
		expect(history.orders[0].offer_id).toEqual(offerId);

		// test with the API
		const token: AuthToken = (await AuthToken.findOne({ userId: user.id }))!;
		const res = await mock(app)
			.get(`/v2/orders?offer_id=${ offerId }`)
			.set("x-request-id", "123")
			.set("Authorization", `Bearer ${ token.id }`);

		const orderHistory: OrderList = res.body;
		expect(orderHistory.orders.length).toEqual(1);
		expect(orderHistory.orders[0].offer_id).toEqual(offerId);
	});

	test("create and find p2p order", async () => {
		const user = await helpers.createUser();

		await helpers.createP2POrder(user.id);
		const orders = await Order.getAll({ origin: "external", userId: user.id, status: "!opened" });

		expect(orders.length).toEqual(1);
		expect(orders[0].contexts.length).toEqual(2);
	});

	test("getOrder returns only my orders", async () => {
		const user1 = await helpers.createUser();
		const user2 = await helpers.createUser();

		const user1token = (await AuthToken.findOne({ userId: user1.id }))!;
		const user2token = (await AuthToken.findOne({ userId: user2.id }))!;

		const user1order = await completeOrder(user1, user1token.deviceId);

		await mock(app)
			.get(`/v2/orders/${ user1order.id }`)
			.set("x-request-id", "123")
			.set("Authorization", `Bearer ${ user1token.id }`)
			.expect(200);

		await mock(app)
			.get(`/v2/orders/${ user1order.id }`)
			.set("x-request-id", "123")
			.set("Authorization", `Bearer ${ user2token.id }`)
			.expect(404);
	});

	test("getOrderHistory limit", async () => {
		const deviceId = "test_device_id";
		const user = await helpers.createUser({ deviceId });
		const offers = await getOffers(user.id, user.appId, {});
		for (let i = 0; i < offers.offers.length && i < 4; i++) {
			const offerId = offers.offers[i].id;
			const openOrder = await createMarketplaceOrder(offerId, user, deviceId);
			const order = await submitOrder(openOrder.id, user, deviceId, "{}");
			await helpers.completePayment(order.id);
		}
		const limit = 2;
		const history = await getOrderHistory(user, deviceId, {}, limit);
		expect(history.orders.length).toEqual(limit);
		expect(history.orders[0].offer_id).toEqual(offers.offers[3].id);
		expect(history.orders[1].offer_id).toEqual(offers.offers[2].id);

		// test with the API
		const token: AuthToken = (await AuthToken.findOne({ userId: user.id }))!;
		const res = await mock(app)
			.get(`/v2/orders?limit=${ limit }`)
			.set("x-request-id", "123")
			.set("Authorization", `Bearer ${ token.id }`);

		const orderHistory: OrderList = res.body;
		expect(orderHistory.orders.length).toEqual(limit);
	});

	test("return same order when one is open", async () => {
		const deviceId = "test_device_id";
		const user = await helpers.createUser({ deviceId });
		const offers = await getOffers(user.id, user.appId, {});
		const order = await createMarketplaceOrder(offers.offers[0].id, user, deviceId);
		const order2 = await createMarketplaceOrder(offers.offers[0].id, user, deviceId);

		expect(order.id).toBe(order2.id);
	});

	test("countToday counts todays completed orders", async () => {
		const deviceId = "test_device_id";
		const user = await helpers.createUser({ deviceId });
		expect(await Order.countToday(user.id, "earn", "marketplace")).toEqual(0);

		const offers = await getOffers(user.id, user.appId, {});
		const offer = offers.offers.find(x => x.offer_type === "earn");
		if (!offer) {
			throw Error("failed to find earn order");
		}

		const openOrder = await createMarketplaceOrder(offer.id, user, deviceId);
		const order = await submitOrder(openOrder.id, user, deviceId, "{}");
		await helpers.completePayment(order.id);

		expect(await Order.countToday(user.id, "earn", "marketplace")).toEqual(1);

		const spendOffer = offers.offers.find(x => x.offer_type === "spend");
		if (!spendOffer) {
			throw Error("failed to find spend order");
		}

		const spendOpenOrder = await createMarketplaceOrder(spendOffer.id, user, deviceId);
		const spendOrder = await submitOrder(spendOpenOrder.id, user, deviceId, undefined);
		await helpers.completePayment(spendOrder.id);

		expect(await Order.countToday(user.id, "earn", "marketplace")).toEqual(1);

		const externalEarnOrder = await helpers.createExternalOrder(user.id);
		const earnOrder = await submitOrder(externalEarnOrder.id, user, deviceId, undefined);
		await helpers.completePayment(earnOrder.id);

		expect(await Order.countToday(user.id, "earn", "marketplace")).toEqual(1);
	});

	test("return getOrder reduces cap", async () => {
		const deviceId = "test_device_id";
		const user = await helpers.createUser({ deviceId });
		const offers = await getOffers(user.id, user.appId, {});
		const appOffer = (await AppOffer.findOne({ offerId: offers.offers[0].id, appId: user.appId }))!;

		for (let i = 0; i < appOffer.cap.per_user && i < appOffer.cap.total; i++) {
			const openOrder = await createMarketplaceOrder(appOffer.offerId, user, deviceId);
			const order = await submitOrder(openOrder.id, user, deviceId, "{}");
			await helpers.completePayment(order.id);
		}

		const counts = await Order.countAllByOffer(user.appId, { userId: user.id });
		expect(counts.get(appOffer.offerId)).toEqual(1);
		const offers2 = await getOffers(user.id, user.appId, {});
		expect(offers2.offers.length).toBeLessThan(offers.offers.length);
	});

	test("payment confirmation jwt for non test apps is es256", async () => {
		async function getPaymentConfirmationJWTFor(appId: string) {
			const user = await helpers.createUser({ appId });
			const wallet = (await user.getWallets()).first!;
			const order = ExternalOrder.new({
				offerId: "offer",
				amount: 1,
				status: "opened",
				blockchainData: {
					sender_address: "sender",
					recipient_address: "recipient"
				}
			}, {
				user,
				meta: {},
				type: "spend",
				wallet: wallet.address
			});
			await order.save();
			await helpers.completePayment(order.id);

			const completedOrder = (await Order.getOne({ orderId: order.id }))!;
			expect(completedOrder.value!.type).toBe("payment_confirmation");
			return jsonwebtoken.decode(
				(completedOrder.value as JWTValue).jwt, { complete: true }
			) as JWTContent<any, "payment_confirmation">;
		}

		const kikJWT = await getPaymentConfirmationJWTFor("kik");
		expect(kikJWT.header.alg.toLowerCase()).toBe("es256");
		expect(kikJWT.header.kid).toBe("es256_0");

		const smplJWT = await getPaymentConfirmationJWTFor("smpl");
		expect(smplJWT.header.alg.toLowerCase()).not.toBe("es256");
		expect(smplJWT.header.kid).not.toBe("es256_0");

		const otherAppJWT = await getPaymentConfirmationJWTFor("othr");
		expect(otherAppJWT.header.alg.toLowerCase()).toBe("es256");
		expect(otherAppJWT.header.kid).toBe("es256_0");

		const testJWT = await getPaymentConfirmationJWTFor("test");
		expect(testJWT.header.alg.toLowerCase()).not.toBe("es256");
		expect(testJWT.header.kid).not.toBe("es256_0");
	});

	test("expiration on openOrder is 10 minutes", async () => {
		const now = moment();
		const deviceId = "test_device_id";
		const user = await helpers.createUser({ deviceId });
		const offers = await getOffers(user.id, user.appId, {});
		const offer = (await Offer.findOneById(offers.offers[0].id))!;
		const openOrder = await createMarketplaceOrder(offer.id, user, deviceId);
		expect(moment(openOrder.expiration_date).diff(now, "minutes")).toBe(10);
	});

	test("changeOrder adds error and changes to fail", async () => {
		const deviceId = "test_device_id";
		const user = await helpers.createUser({ deviceId });
		const offers = await getOffers(user.id, user.appId, { type: "spend" });
		const openOrder = await createMarketplaceOrder(offers.offers[0].id, user, deviceId);
		await submitOrder(openOrder.id, user, deviceId, "{}");
		// failed to pay to blockchain
		const error = {
			message: "failed to submit to blockchain",
			error: "blockchain_timeout",
			code: 2323
		};
		const changedOrder = await changeOrder(
			openOrder.id,
			user,
			{
				error
			});
		expect(changedOrder.status).toBe("failed");
		const order = await getOrder(openOrder.id, user);
		expect(order.status).toBe("failed");
		expect(order.error).toEqual(error);
	});

	test("order setFailure date", async () => {
		const deviceId = "test_device_id";
		const user = await helpers.createUser({ deviceId });
		const offers = await getOffers(user.id, user.appId, { type: "spend" });

		// not passing failureDate
		{
			const openOrder = await createMarketplaceOrder(offers.offers[0].id, user, deviceId);
			await submitOrder(openOrder.id, user, deviceId, "{}");
			const dbOrder = (await Order.getOne({ orderId: openOrder.id }))!;
			const expDate = dbOrder.expirationDate!;
			await setFailedOrder(dbOrder, TransactionTimeout());
			const dbOrder2 = (await Order.getOne({ orderId: openOrder.id }))!;
			expect(expDate.getTime()).toBeGreaterThan(dbOrder2.currentStatusDate.getTime());
		}

		// passing expDate as failureDate
		{
			const openOrder = await createMarketplaceOrder(offers.offers[0].id, user, deviceId);
			await submitOrder(openOrder.id, user, deviceId, "{}");
			const dbOrder = (await Order.getOne({ orderId: openOrder.id }))!;
			const expDate = dbOrder.expirationDate!;
			await setFailedOrder(dbOrder, TransactionTimeout(), expDate);
			const dbOrder2 = (await Order.getOne({ orderId: openOrder.id }))!;
			expect(expDate.getTime()).toEqual(dbOrder2.currentStatusDate.getTime());
		}
	});

	test("only app offers should return", async () => {
		const app = await helpers.createApp(generateId(IdPrefix.App));
		const user = await helpers.createUser({ appId: app.id });
		const offers = await Offer.find();
		const offersIds: string[] = [];

		// add even offers to app
		for (let i = 0; i < offers.length; i++) {
			if (i % 2 === 0) {
				offersIds.push(offers[i].id);
				await AppOffer.create({
					appId: app.id,
					offerId: offers[i].id,
					cap: { total: 10, per_user: 10 },
					walletAddress: "some_address"
				}).save();
			}
		}

		const apiOffersIds: string[] = [];
		for (const offer of (await getOffers(user.id, user.appId, {})).offers) {
			apiOffersIds.push(offer.id);
		}

		expect(offersIds.sort()).toEqual(apiOffersIds.sort());

		const appOffers = [...await AppOffer.getAppOffers(app.id, "earn"), ...await AppOffer.getAppOffers(app.id, "spend")];

		expect(offersIds.sort()).toEqual(appOffers.map(appOffer => appOffer.offerId).sort());
	});

	test("offer cap is not shared between apps", async () => {
		const offer = (await Offer.findOne())!;

		async function createAppUser(offer: Offer, appId: string): Promise<User> {
			const app = await helpers.createApp(appId);
			const user = await helpers.createUser({ appId: app.id });
			await AppOffer.create({
				appId: app.id,
				offerId: offer.id,
				cap: { total: 1, per_user: 1 },
				walletAddress: "some_address"
			}).save();

			return user;
		}

		const user1 = await createAppUser(offer, generateId(IdPrefix.App));
		const user2 = await createAppUser(offer, generateId(IdPrefix.App));

		const deviceId1 = (await AuthToken.findOne({ userId: user1.id })).deviceId;
		const deviceId2 = (await AuthToken.findOne({ userId: user2.id })).deviceId;


		const openOrder = await createMarketplaceOrder(offer.id, user1, deviceId1);
		const order = await submitOrder(openOrder.id, user1, deviceId1, "{}");
		await helpers.completePayment(order.id);

		// user1 should receive an error
		await expect(createMarketplaceOrder(offer.id, user1, deviceId1)).rejects.toThrow();

		// user2 should be able to open an order
		await expect(createMarketplaceOrder(offer.id, user2, deviceId2)).resolves.toBeDefined();
	});

	test("fail to create an order when user has no wallet", async () => {
		const deviceId = "test_device_id";
		const user = await helpers.createUser({ deviceId, createWallet: false });
		const offers = await getOffers(user.id, user.appId, {});

		await expect(createMarketplaceOrder(offers.offers[0].id, user, deviceId))
			.rejects
			.toThrow(UserHasNoWallet(user.id, deviceId).message);
	});

	test("multiple users on the same device with different wallets", async () => {
		const deviceId = "test_device_id";
		const appId = (await Application.findOne())!.id;
		const user1 = await helpers.createUser({ deviceId, appId });

		let token = (await AuthToken.findOne({ userId: user1.id }))!;
		let offers = await getOffers(user1.id, appId, {});
		const offersCount = offers.offers.length;
		const orderCount = randomInteger(1, offersCount);

		for (let i = 0; i < orderCount; i++) {
			const offerId = offers.offers[i].id;
			const openOrder = await createMarketplaceOrder(offerId, user1, deviceId);
			const order = await submitOrder(openOrder.id, user1, deviceId, "{}");
			await helpers.completePayment(order.id);
		}

		let history = await getHistory(token);
		expect(history.length).toEqual(orderCount);

		const user2 = await helpers.createUser({ deviceId, appId });
		token = (await AuthToken.findOne({ userId: user2.id }))!;

		// check that the orders by user1 did not affect the number of available offers to user2
		offers = await getOffers(user2.id, appId, {});
		expect(offers.offers.length).toBe(offersCount);

		// check that the orders by user1 did not affect the order history of user2
		history = await getHistory(token);
		expect(history.length).toEqual(0);
	});

	test("shared wallet across apps", async () => {
		const walletAddress = `wallet-${ generateId() }`;

		async function create(appName: string): Promise<[User, string, Application]> {
			const deviceId = `device_${ generateId() }`;
			const app = await helpers.createApp(appName);
			const user = await helpers.createUser({ deviceId, appId: app.id, createWallet: false });
			await user.updateWallet(deviceId, walletAddress);

			return [user, deviceId, app];
		}

		const [user1, deviceId1, app1] = await create("app1");
		const [user2, deviceId2, app2] = await create("app2");

		await helpers.createOffers();

		const offers1 = (await getOffers(user1.id, app1.id, {})).offers;
		const offers2 = (await getOffers(user2.id, app2.id, {})).offers;

		const orders1 = await createOrdersForUser(user1, deviceId1, app1, { offers: offers1 });
		// make sure that at least 1 order was created for user1/app1
		expect(orders1.length).toBeGreaterThan(0);

		const orders2 = await createOrdersForUser(user2, deviceId2, app2, { offers: offers2 });
		// make sure that at least 1 order was created for user2/app2
		expect(orders2.length).toBeGreaterThan(0);

		const totalOrdersCount = orders1.length + orders2.length;

		const token1 = (await AuthToken.findOne({ userId: user1.id }))!;
		const token2 = (await AuthToken.findOne({ userId: user2.id }))!;

		const history1 = await getHistory(token1);
		// make sure that the history of user1 is the same as the amount of both user1 and user2 orders
		expect(history1.length).toEqual(totalOrdersCount);

		const history2 = await getHistory(token2);
		// make sure that the history of user2 is the same as the amount of both user1 and user2 orders
		expect(history2.length).toEqual(totalOrdersCount);

		const historyIds1 = history1.map(o => o.id);
		const historyIds2 = history2.map(o => o.id);
		// make sure that both histories contain the exact same orders
		historyIds1.forEach(o => expect(historyIds2).toContain(o));

		// make sure that orders created in the other app have a modified title
		history1
			.filter(o => !orders1.includes(o.id))
			.forEach(o => expect(o.title.endsWith(` transaction in ${ app2.name }`)));

		history2
			.filter(o => !orders2.includes(o.id))
			.forEach(o => expect(o.title.endsWith(` transaction in ${ app1.name }`)));
	});

	test("one user, two wallets on two devices", async () => {
		const app = await helpers.createApp("myapp");
		await helpers.createOffers();

		const deviceId1 = `device_${ generateId() }`;
		const deviceId2 = `device_${ generateId() }`;
		const walletAddress1 = `wallet-${ generateId() }`;
		const walletAddress2 = `wallet-${ generateId() }`;

		const user = await helpers.createUser({ deviceId: deviceId1, appId: app.id, createWallet: false });
		await user.updateWallet(deviceId1, walletAddress1);
		const orders1 = await createOrdersForUser(user, deviceId1, app, { divideBy: 2 });
		expect(orders1.length).toBeGreaterThan(0);

		const token1 = (await AuthToken.findOne({ userId: user.id }))!;
		const token2 = await (AuthToken.new({
			userId: user.id,
			deviceId: deviceId2
		})).save();
		await user.updateWallet(deviceId2, walletAddress2);
		const orders2 = await createOrdersForUser(user, deviceId2, app, { divideBy: 2 });
		expect(orders2.length).toBeGreaterThan(0);

		expect((await user.getWallets()).count).toBe(2);

		const history1 = (await getHistory(token1)).map(o => o.id);
		const history2 = (await getHistory(token2)).map(o => o.id);
		history1.forEach(o => expect(history2).not.toContain(o));
		history2.forEach(o => expect(history1).not.toContain(o));
	});

	test("one user, one wallet on two devices", async () => {
		const app = await helpers.createApp("myapp");
		await helpers.createOffers();

		const deviceId1 = `device_${ generateId() }`;
		const walletAddress = `wallet-${ generateId() }`;
		const user = await helpers.createUser({ deviceId: deviceId1, appId: app.id, createWallet: false });
		await user.updateWallet(deviceId1, walletAddress);
		const token1 = (await AuthToken.findOne({ userId: user.id }))!;
		const orders1 = await createOrdersForUser(user, deviceId1, app, { divideBy: 2 });
		expect(orders1.length).toBeGreaterThan(0);

		const deviceId2 = `device_${ generateId() }`;
		const token2 = await (AuthToken.new({
			userId: user.id,
			deviceId: deviceId2
		})).save();
		await user.updateWallet(deviceId2, walletAddress);
		const orders2 = await createOrdersForUser(user, deviceId2, app, { divideBy: 2 });
		expect(orders2.length).toBeGreaterThan(0);

		expect((await user.getWallets()).count).toBe(2);
		expect(new Set((await user.getWallets()).all().map(w => w.address)).size).toBe(1);

		const history1 = (await getHistory(token1)).map(o => o.id);
		const history2 = (await getHistory(token2)).map(o => o.id);
		expect(history1.length).toBe(history2.length);
		history1.forEach(o => expect(history2).toContain(o));
	});
});
