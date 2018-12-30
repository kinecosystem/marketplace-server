import * as moment from "moment";
import mock = require("supertest");
import * as jsonwebtoken from "jsonwebtoken";

import { app } from "../../../scripts/bin/public/app";
import * as metrics from "../../../scripts/bin/metrics";
import { initLogger } from "../../../scripts/bin/logging";
import { AuthToken, User } from "../../../scripts/bin/models/users";
import { JWTValue, Offer } from "../../../scripts/bin/models/offers";
import { getOffers } from "../../../scripts/bin/public/services/offers";
import { ExternalOrder, Order } from "../../../scripts/bin/models/orders";
import { generateId, random, IdPrefix } from "../../../scripts/bin/utils/utils";
import { close as closeModels, init as initModels } from "../../../scripts/bin/models/index";
import {
	getOrder,
	OrderList,
	changeOrder,
	submitOrder,
	setFailedOrder,
	getOrderHistory,
	createMarketplaceOrder
} from "../../../scripts/bin/public/services/orders";
import { TransactionTimeout } from "../../../scripts/bin/errors";
import { AppOffer } from "../../../scripts/bin/models/applications";
import { JWTContent } from "../../../scripts/bin/public/jwt";

import * as helpers from "../helpers";

describe("test orders", async () => {
	jest.setTimeout(20000);

	beforeEach(async done => {
		initLogger();
		await initModels();
		await helpers.clearDatabase();
		await helpers.createOffers();
		helpers.patchDependencies();

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
		const deviceId = "test_device_id";
		const user = await helpers.createUser({ deviceId });
		const offers = await getOffers(user.id, user.appId, {});
		const offer = offers.offers.find(x => x.offer_type === "earn");

		if (!offer) {
			throw Error("failed to find earn order");
		}

		await createMarketplaceOrder(offer.id, user, deviceId);

		const offers2 = await getOffers(user.id, user.appId, {});
		const foundOffer = offers2.offers.find(x => x.id === offer.id);

		expect(foundOffer).toBeTruthy();
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
			.get(`/v1/orders?offer_id=${ offerId }`)
			.set("x-request-id", "123")
			.set("Authorization", `Bearer ${ token.id }`);

		const orderHistory: OrderList = res.body;
		expect(orderHistory.orders.length).toEqual(1);
		expect(orderHistory.orders[0].offer_id).toEqual(offerId);
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
			.get(`/v1/orders?limit=${ limit }`)
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

			const completedOrder = (await Order.getOne(order.id))!;
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
			user.id,
			{
				error
			});
		expect(changedOrder.status).toBe("failed");
		const order = await getOrder(openOrder.id, user.id);
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
			const dbOrder = (await Order.getOne(openOrder.id))!;
			const expDate = dbOrder.expirationDate!;
			await setFailedOrder(dbOrder, TransactionTimeout());
			const dbOrder2 = (await Order.getOne(openOrder.id))!;
			expect(expDate.getTime()).toBeGreaterThan(dbOrder2.currentStatusDate.getTime());
		}

		// passing expDate as failureDate
		{
			const openOrder = await createMarketplaceOrder(offers.offers[0].id, user, deviceId);
			await submitOrder(openOrder.id, user, deviceId, "{}");
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
		for (const offer of (await getOffers(user.id, user.appId, {})).offers) {
			apiOffersIds.push(offer.id);
		}

		expect(offersIds.sort()).toEqual(apiOffersIds.sort());

		const appOffers = [...await AppOffer.getAppOffers(app.id, "earn"), ...await AppOffer.getAppOffers(app.id, "spend")];

		expect(offersIds.sort()).toEqual(appOffers.map(appOffer => appOffer.offerId).sort());
	});

	test("offer cap is not shared between apps", async () => {
		const offer = (await Offer.findOne())!;

		async function createAppUser(offer: Offer, appId: string): Promise<[User, string]> {
			const deviceId = generateId();
			const app = await helpers.createApp(appId);
			const user = await helpers.createUser({ appId: app.id, deviceId });
			await AppOffer.create({
				appId: app.id,
				offerId: offer.id,
				cap: { total: 1, per_user: 1 },
				walletAddress: "some_address"
			}).save();

			return [user, deviceId];
		}

		const [user1, deviceId1] = await createAppUser(offer, generateId(IdPrefix.App));
		const [user2, deviceId2] = await createAppUser(offer, generateId(IdPrefix.App));

		const openOrder = await createMarketplaceOrder(offer.id, user1, deviceId1);
		const order = await submitOrder(openOrder.id, user1, deviceId1, "{}");
		await helpers.completePayment(order.id);

		// user1 should receive an error
		await expect(createMarketplaceOrder(offer.id, user1, deviceId1)).rejects.toThrow();

		// user2 should be able to open an order
		await expect(createMarketplaceOrder(offer.id, user2, deviceId2)).resolves.toBeDefined();
	});
});
