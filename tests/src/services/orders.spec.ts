import mock = require("supertest");

import * as moment from "moment";
import * as metrics from "../../../scripts/bin/metrics";
import { generateId, IdPrefix, random } from "../../../scripts/bin/utils";
import { Event } from "../../../scripts/bin/analytics";
import { AuthToken, User } from "../../../scripts/bin/models/users";
import { JWTValue, Offer } from "../../../scripts/bin/models/offers";
import * as payment from "../../../scripts/bin/public/services/payment";
import { getOffers } from "../../../scripts/bin/public/services/offers";
import { getDefaultLogger, initLogger } from "../../../scripts/bin/logging";
import { ExternalOrder, Order } from "../../../scripts/bin/models/orders";
import { close as closeModels, init as initModels } from "../../../scripts/bin/models/index";
import {
	changeOrder,
	createMarketplaceOrder,
	getOrder,
	getOrderHistory,
	setFailedOrder,
	submitOrder
} from "../../../scripts/bin/public/services/orders";
import { TransactionTimeout } from "../../../scripts/bin/errors";
import { AppOffer } from "../../../scripts/bin/models/applications";
import { JWTContent } from "../../../scripts/bin/public/jwt";

import * as helpers from "../helpers";
import * as jsonwebtoken from "jsonwebtoken";
import { app } from "../../../scripts/bin/public/app";
import { OrderList } from "../../../scripts/src/public/services/orders";

describe("test orders", async () => {
	jest.setTimeout(20000);

	beforeEach(async done => {
		initLogger();
		await initModels();
		await helpers.clearDatabase();
		await helpers.createOffers();
		(payment.payTo as any) = () => 1; // XXX use a patching library
		(payment.getBlockchainConfig as any) = () => 1; // XXX use a patching library
		(payment.setWatcherEndpoint as any) = () => 1; // XXX use a patching library
		(payment.createWallet as any) = () => 1; // XXX use a patching library
		Event.prototype.report = () => Promise.resolve();

		done();
	});

	afterEach(async done => {
		await closeModels();
		done();
	});

	afterAll(async () => {
		await metrics.destruct();
	});

	test("getAll and filters", async () => {
		const user = await helpers.createUser();
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
		const user = await helpers.createUser();
		const offers = await getOffers(user.id, user.appId, {}, getDefaultLogger());
		const offer = offers.offers.find(x => x.offer_type === "earn");

		if (!offer) {
			throw Error("failed to find earn order");
		}

		const order = await createMarketplaceOrder(offer.id, user, getDefaultLogger());

		const offers2 = await getOffers(user.id, user.appId, {}, getDefaultLogger());
		const foundOffer = offers2.offers.find(x => x.id === offer.id);

		expect(foundOffer).toBeTruthy();
	});

	test("filter order by offer_id", async () => {
		const user = await helpers.createUser();
		const offers = await getOffers(user.id, user.appId, {}, getDefaultLogger());
		for (let i = 0; i < offers.offers.length && i < 4; i++) {
			const offerId = offers.offers[i].id;
			const openOrder = await createMarketplaceOrder(offerId, user, getDefaultLogger());
			const order = await submitOrder(openOrder.id, user.id, "{}", user.walletAddress, user.appId, getDefaultLogger());
			await helpers.completePayment(order.id);
		}
		const offerId = offers.offers[0].id;
		const history = await getOrderHistory(user.id, { offerId }, getDefaultLogger());
		expect(history.orders.length).toEqual(1);
		expect(history.orders[0].offer_id).toEqual(offerId);

		// test with the API
		const token: AuthToken = (await AuthToken.findOne({ userId: user.id }))!;
		const res = await mock(app)
			.get(`/v1/orders?offer_id=${ offerId }`)
			.set("x-request-id", "123")
			.set("Authorization", `Bearer ${ token.id }`);

		const orderHistory: OrderList = res.body;
		expect(orderHistory.orders.length).toEqual(1);
		expect(orderHistory.orders[0].offer_id).toEqual(offerId);
	});

	test("getOrderHistory limit", async () => {
		const user = await helpers.createUser();
		const offers = await getOffers(user.id, user.appId, {}, getDefaultLogger());
		for (let i = 0; i < offers.offers.length && i < 4; i++) {
			const offerId = offers.offers[i].id;
			const openOrder = await createMarketplaceOrder(offerId, user, getDefaultLogger());
			const order = await submitOrder(openOrder.id, user.id, "{}", user.walletAddress, user.appId, getDefaultLogger());
			await helpers.completePayment(order.id);
		}
		const limit = 2;
		const history = await getOrderHistory(user.id, {}, getDefaultLogger(), limit);
		expect(history.orders.length).toEqual(limit);
		expect(history.orders[0].offer_id).toEqual(offers.offers[3].id);
		expect(history.orders[1].offer_id).toEqual(offers.offers[2].id);

		// test with the API
		const token: AuthToken = (await AuthToken.findOne({ userId: user.id }))!;
		const res = await mock(app)
			.get(`/v1/orders?limit=${ limit }`)
			.set("x-request-id", "123")
			.set("Authorization", `Bearer ${ token.id }`);

		const orderHistory: OrderList = res.body;
		expect(orderHistory.orders.length).toEqual(limit);
	});

	test("return same order when one is open", async () => {
		const user = await helpers.createUser();
		const offers = await getOffers(user.id, user.appId, {}, getDefaultLogger());
		const order = await createMarketplaceOrder(offers.offers[0].id, user, getDefaultLogger());
		const order2 = await createMarketplaceOrder(offers.offers[0].id, user, getDefaultLogger());

		expect(order.id).toBe(order2.id);
	});

	test("countToday counts todays completed orders", async () => {
		const user = await helpers.createUser();
		expect(await Order.countToday(user.id, "earn", "marketplace")).toEqual(0);

		const offers = await getOffers(user.id, user.appId, {}, getDefaultLogger());
		const offer = offers.offers.find(x => x.offer_type === "earn");
		if (!offer) {
			throw Error("failed to find earn order");
		}

		const openOrder = await createMarketplaceOrder(offer.id, user, getDefaultLogger());
		const order = await submitOrder(openOrder.id, user.id, "{}", user.walletAddress, user.appId, getDefaultLogger());
		await helpers.completePayment(order.id);

		expect(await Order.countToday(user.id, "earn", "marketplace")).toEqual(1);

		const spendOffer = offers.offers.find(x => x.offer_type === "spend");
		if (!spendOffer) {
			throw Error("failed to find spend order");
		}

		const spendOpenOrder = await createMarketplaceOrder(spendOffer.id, user, getDefaultLogger());
		const spendOrder = await submitOrder(spendOpenOrder.id, user.id, undefined, user.walletAddress, user.appId, getDefaultLogger());
		await helpers.completePayment(spendOrder.id);

		expect(await Order.countToday(user.id, "earn", "marketplace")).toEqual(1);

		const externalEarnOrder = await helpers.createExternalOrder(user.id);
		const earnOrder = await submitOrder(externalEarnOrder.id, user.id, undefined, user.walletAddress, user.appId, getDefaultLogger());
		await helpers.completePayment(earnOrder.id);

		expect(await Order.countToday(user.id, "earn", "marketplace")).toEqual(1);
	});

	test("return getOrder reduces cap", async () => {
		const user = await helpers.createUser();
		const offers = await getOffers(user.id, user.appId, {}, getDefaultLogger());
		const appOffer = (await AppOffer.findOne({ offerId: offers.offers[0].id, appId: user.appId }))!;

		for (let i = 0; i < appOffer.cap.per_user && i < appOffer.cap.total; i++) {
			const openOrder = await createMarketplaceOrder(appOffer.offerId, user, getDefaultLogger());
			const order = await submitOrder(openOrder.id, user.id, "{}", user.walletAddress, user.appId, getDefaultLogger());
			await helpers.completePayment(order.id);
		}

		const counts = await Order.countAllByOffer(user.appId, { userId: user.id });
		expect(counts.get(appOffer.offerId)).toEqual(1);
		const offers2 = await getOffers(user.id, user.appId, {}, getDefaultLogger());
		expect(offers2.offers.length).toBeLessThan(offers.offers.length);
	});

	test("payment jwt for non test apps is es256", async () => {
		async function getPaymentJWT(appId: string) {
			const user = await helpers.createUser({ appId });
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
				type: "spend"
			});
			await order.save();
			await helpers.completePayment(order.id);

			const completedOrder = (await Order.getOne(order.id))!;
			expect(completedOrder.value!.type).toBe("payment_confirmation");
			return jsonwebtoken.decode(
				(completedOrder.value as JWTValue).jwt, { complete: true }
			) as JWTContent<any, "payment_confirmation">;
		}

		const kikJWT = await getPaymentJWT("kik");
		expect(kikJWT.header.alg.toLowerCase()).toBe("es256");
		expect(kikJWT.header.kid).toBe("es256_0");

		const smplJWT = await getPaymentJWT("smpl");
		expect(smplJWT.header.alg.toLowerCase()).not.toBe("es256");
		expect(smplJWT.header.kid).not.toBe("es256_0");

		const otherAppJWT = await getPaymentJWT("othr");
		expect(otherAppJWT.header.alg.toLowerCase()).toBe("es256");
		expect(otherAppJWT.header.kid).toBe("es256_0");

		const testJWT = await getPaymentJWT("test");
		expect(smplJWT.header.alg.toLowerCase()).not.toBe("es256");
		expect(smplJWT.header.kid).not.toBe("es256_0");
	});

	test("expiration on openOrder is 10 minutes", async () => {
		const user: User = await helpers.createUser();
		const offers = await getOffers(user.id, user.appId, {}, getDefaultLogger());
		const offer = (await Offer.findOneById(offers.offers[0].id))!;
		const now = moment();
		const openOrder = await createMarketplaceOrder(offer.id, user, getDefaultLogger());
		expect(moment(openOrder.expiration_date).diff(now, "minutes")).toBe(10);
	});

	test("changeOrder adds error and changes to fail", async () => {
		const user = await helpers.createUser();
		const offers = await getOffers(user.id, user.appId, { type: "spend" }, getDefaultLogger());
		const openOrder = await createMarketplaceOrder(offers.offers[0].id, user, getDefaultLogger());
		await submitOrder(openOrder.id, user.id, "{}", user.walletAddress, user.appId, getDefaultLogger());
		// failed to pay to blockchain
		const error = {
			message: "failed to submit to blockchain",
			error: "blockchain_timeout",
			code: 2323
		};
		const changedOrder = await changeOrder(
			openOrder.id,
			user.id,
			{
				error
			},
			getDefaultLogger());
		expect(changedOrder.status).toBe("failed");
		const order = await getOrder(openOrder.id, user.id, getDefaultLogger());
		expect(order.status).toBe("failed");
		expect(order.error).toEqual(error);
	});

	test("order setFailure date", async () => {
		const user = await helpers.createUser();
		const offers = await getOffers(user.id, user.appId, { type: "spend" }, getDefaultLogger());

		// not passing failureDate
		{
			const openOrder = await createMarketplaceOrder(offers.offers[0].id, user, getDefaultLogger());
			await submitOrder(openOrder.id, user.id, "{}", user.walletAddress, user.appId, getDefaultLogger());
			const dbOrder = (await Order.getOne(openOrder.id))!;
			const expDate = dbOrder.expirationDate!;
			await setFailedOrder(dbOrder, TransactionTimeout());
			const dbOrder2 = (await Order.getOne(openOrder.id))!;
			expect(expDate.getTime()).toBeGreaterThan(dbOrder2.currentStatusDate.getTime());
		}

		// passing expDate as failureDate
		{
			const openOrder = await createMarketplaceOrder(offers.offers[0].id, user, getDefaultLogger());
			await submitOrder(openOrder.id, user.id, "{}", user.walletAddress, user.appId, getDefaultLogger());
			const dbOrder = (await Order.getOne(openOrder.id))!;
			const expDate = dbOrder.expirationDate!;
			await setFailedOrder(dbOrder, TransactionTimeout(), expDate);
			const dbOrder2 = (await Order.getOne(openOrder.id))!;
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
		for (const offer of (await getOffers(user.id, user.appId, {}, getDefaultLogger())).offers) {
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

		const openOrder = await createMarketplaceOrder(offer.id, user1, getDefaultLogger());
		const order = await submitOrder(openOrder.id, user1.id, "{}", user1.walletAddress, user1.appId, getDefaultLogger());
		await helpers.completePayment(order.id);

		// user1 should receive an error
		await expect(createMarketplaceOrder(offer.id, user1, getDefaultLogger())).rejects.toThrow();

		// user2 should be able to open an order
		await expect(createMarketplaceOrder(offer.id, user2, getDefaultLogger())).resolves.toBeDefined();
	});
});
