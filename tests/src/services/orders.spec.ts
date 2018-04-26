import * as moment from "moment";

import { User } from "../../../scripts/bin/models/users";
import { Order } from "../../../scripts/bin/models/orders";
import { Offer } from "../../../scripts/bin/models/offers";
import * as payment from "../../../scripts/bin/public/services/payment";
import { getOffers } from "../../../scripts/bin/public/services/offers";
import { getDefaultLogger, initLogger } from "../../../scripts/bin/logging";
import { init as initModels, close as closeModels } from "../../../scripts/bin/models/index";
import { createMarketplaceOrder, submitOrder } from "../../../scripts/bin/public/services/orders";

import * as helpers from "../helpers";

describe("test orders", async () => {
	jest.setTimeout(20000);

	beforeAll(async done => {
		initLogger();
		await initModels();

		const user = await helpers.createUser();
		await helpers.createOffers();
		await helpers.createOrders(user.id);
		done();
	});

	afterAll(async done => {
		await closeModels();
		done();
	});

	test("getAllNonOpen", async () => {
		const user = await User.findOne();
		const orders = await Order.getAll(user.id, "!opened", 25);
		expect(orders.length).toBeGreaterThan(0);
		expect(orders.length).toBe(orders.filter(o => o.status !== "opened").length);
	});

	test("return same order when one is open", async () => {
		const user: User = await User.findOne();
		const offers = await getOffers(user.id, user.appId, {}, getDefaultLogger());
		const order = await createMarketplaceOrder(offers.offers[0].id, user, getDefaultLogger());
		const order2 = await createMarketplaceOrder(offers.offers[0].id, user, getDefaultLogger());

		expect(order.id).toBe(order2.id);
	});

	test("return getOrder reduces cap", async () => {
		(payment.payTo as any) = function() {
			return 1;
		}; // XXX use a patching library

		const user: User = await helpers.createUser();
		const offers = await getOffers(user.id, user.appId, {}, getDefaultLogger());
		const offer = await Offer.findOneById(offers.offers[0].id);
		for (let i = 0; i < offer.cap.per_user; i++) {
			const openOrder = await createMarketplaceOrder(offer.id, user, getDefaultLogger());
			const order = await submitOrder(openOrder.id, "{}", user.walletAddress, user.appId, getDefaultLogger());
			await helpers.completePayment(order.id);
		}

		const offers2 = await getOffers(user.id, user.appId, {}, getDefaultLogger());
		expect(offers2.offers.length).toBeLessThan(offers.offers.length);
	});

	test("expiration on openOrder is 10 minutes", async () => {
		const user: User = await helpers.createUser();
		const offers = await getOffers(user.id, user.appId, {}, getDefaultLogger());
		const offer = await Offer.findOneById(offers.offers[0].id);
		const now = moment();
		const openOrder = await createMarketplaceOrder(offer.id, user, getDefaultLogger());
		expect(moment(openOrder.expiration_date).diff(now, "minutes")).toBe(10);
	});
});
