import * as moment from "moment";

import { random } from "../../../scripts/bin/utils";
import { Event } from "../../../scripts/bin/analytics";
import { User } from "../../../scripts/bin/models/users";
import { Offer, JWTValue } from "../../../scripts/bin/models/offers";
import * as payment from "../../../scripts/bin/public/services/payment";
import { getOffers } from "../../../scripts/bin/public/services/offers";
import { getDefaultLogger, initLogger } from "../../../scripts/bin/logging";
import { Order, ExternalOrder, OrderContext } from "../../../scripts/bin/models/orders";
import { init as initModels, close as closeModels } from "../../../scripts/bin/models/index";
import {
	createMarketplaceOrder,
	submitOrder,
	getOrder,
	changeOrder,
	setFailedOrder
} from "../../../scripts/bin/public/services/orders";
import { JWTContent } from "../../../scripts/bin/public/jwt";

import * as helpers from "../helpers";
import * as jsonwebtoken from "jsonwebtoken";
import * as expect from "expect";
import { TransactionTimeout } from "../../../scripts/bin/errors";

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

	test("getAll and filters", async () => {
		const user = await helpers.createUser();
		let count = await helpers.createOrders(user.id);

		let orders = await Order.getAll({ userId: user.id, status: "!opened" }, 25);
		expect(orders.length).toBe(count);
		expect(orders.length).toBe(orders.filter(o => o.status !== "opened").length);

		const offers = new Map<string, number>();
		(await Order.getAll({ userId: user.id })).forEach(order => {
			offers.set(order.offerId, offers.has(order.offerId) ? offers.get(order.offerId) + 1 : 1);
		});

		const [offerId, ordersCount] = random(offers);
		orders = await Order.getAll({ userId: user.id, offerId }, 25);
		expect(orders.length).toBe(ordersCount);

		count = await helpers.createExternalOrders(user.id);
		orders = await Order.getAll({ userId: user.id, origin: "external" }, 25);
		expect(orders.length).toBe(count);
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

	test("return same order when one is open", async () => {
		const user = await helpers.createUser();
		const offers = await getOffers(user.id, user.appId, {}, getDefaultLogger());
		const order = await createMarketplaceOrder(offers.offers[0].id, user, getDefaultLogger());
		const order2 = await createMarketplaceOrder(offers.offers[0].id, user, getDefaultLogger());

		expect(order.id).toBe(order2.id);
	});

	test("countToday counts todays completed orders", async () => {
		const user = await helpers.createUser();
		expect(await Order.countToday(user.id, "earn")).toEqual(0);

		const offers = await getOffers(user.id, user.appId, {}, getDefaultLogger());
		const offer = offers.offers.find(x => x.offer_type === "earn");
		if (!offer) {
			throw Error("failed to find earn order");
		}

		const openOrder = await createMarketplaceOrder(offer.id, user, getDefaultLogger());
		const order = await submitOrder(openOrder.id, user.id, "{}", user.walletAddress, user.appId, getDefaultLogger());
		await helpers.completePayment(order.id);

		expect(await Order.countToday(user.id, "earn")).toEqual(1);

		const spendOffer = offers.offers.find(x => x.offer_type === "spend");
		if (!spendOffer) {
			throw Error("failed to find spend order");
		}

		const spendopenOrder = await createMarketplaceOrder(spendOffer.id, user, getDefaultLogger());
		const spendOrder = await submitOrder(spendopenOrder.id, user.id, null, user.walletAddress, user.appId, getDefaultLogger());
		await helpers.completePayment(spendOrder.id);

		expect(await Order.countToday(user.id, "earn")).toEqual(1);
	});

	test("return getOrder reduces cap", async () => {
		const user = await helpers.createUser();
		const offers = await getOffers(user.id, user.appId, {}, getDefaultLogger());
		const offer = await Offer.findOneById(offers.offers[0].id);

		for (let i = 0; i < offer.cap.per_user && i < offer.cap.total; i++) {
			const openOrder = await createMarketplaceOrder(offer.id, user, getDefaultLogger());
			const order = await submitOrder(openOrder.id, user.id, "{}", user.walletAddress, user.appId, getDefaultLogger());
			await helpers.completePayment(order.id);
		}

		const offers2 = await getOffers(user.id, user.appId, {}, getDefaultLogger());
		expect(offers2.offers.length).toBeLessThan(offers.offers.length);
	});

	test("payment jwt for kik is es256", async () => {
		async function getPaymentJWT(appId: string) {
			const user = await helpers.createUser(appId);
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

			const completedOrder = await Order.getOne(order.id);
			expect(completedOrder.value.type).toBe("payment_confirmation");
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
	});

	test("expiration on openOrder is 10 minutes", async () => {
		const user: User = await helpers.createUser();
		const offers = await getOffers(user.id, user.appId, {}, getDefaultLogger());
		const offer = await Offer.findOneById(offers.offers[0].id);
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
			const dbOrder = await Order.getOne(openOrder.id);
			const expDate = dbOrder.expirationDate;
			await setFailedOrder(dbOrder, TransactionTimeout());
			const dbOrder2 = await Order.getOne(openOrder.id);
			expect(expDate.getTime()).toBeGreaterThan(dbOrder2.currentStatusDate.getTime());
		}

		// passing expDate as failureDate
		{
			const openOrder = await createMarketplaceOrder(offers.offers[0].id, user, getDefaultLogger());
			await submitOrder(openOrder.id, user.id, "{}", user.walletAddress, user.appId, getDefaultLogger());
			const dbOrder = await Order.getOne(openOrder.id);
			const expDate = dbOrder.expirationDate;
			await setFailedOrder(dbOrder, TransactionTimeout(), expDate);
			const dbOrder2 = await Order.getOne(openOrder.id);
			expect(expDate.getTime()).toEqual(dbOrder2.currentStatusDate.getTime());
		}
	});

	test("only app offers should return", async () => {
		const app = await helpers.createApp("app1");
		const user = await helpers.createUser(app.id);
		const offers = await Offer.find();
		const offersIds: string[] = [];

		// add even offers to app
		for (let i = 0; i < offers.length; i++) {

			if (i % 2 === 0) {
				offersIds.push(offers[i].id);
				app.offers.push(offers[i]);
				await app.save();
			}
		}

		const apiOffersIds: string[] = [];
		for (const offer of (await getOffers(user.id, user.appId, {}, getDefaultLogger())).offers) {
			apiOffersIds.push(offer.id);
		}

		expect(offersIds.sort()).toEqual(apiOffersIds.sort());
	});
});
