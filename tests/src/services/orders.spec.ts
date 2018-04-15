import { getConfig } from "../../../scripts/bin/public/config"; // must be the first import
getConfig();

import * as helpers from "../helpers";
import { init as initModels } from "../../../scripts/bin/models/index";
import { Order } from "../../../scripts/bin/models/orders";
import { User } from "../../../scripts/bin/models/users";
import { createMarketplaceOrder, getOrder } from "../../../scripts/bin/public/services/orders";
import { getOffers } from "../../../scripts/bin/public/services/offers";
import { getDefaultLogger, initLogger } from "../../../scripts/src/logging";

describe("test orders", async () => {
	beforeAll(async () => {
		initLogger();
		await initModels();

		const user = await helpers.createUser();
		await helpers.createOffers();
		await helpers.createOrders(user.id);
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
		console.log(offers.offers);
		const order = await createMarketplaceOrder(offers.offers[0].id, user,  getDefaultLogger());
		const order2 = await createMarketplaceOrder(offers.offers[0].id, user, getDefaultLogger());

		expect(order.id).toBe(order2.id);
	});

	test("return getOrder reduces cap", async () => {
		const user: User = await helpers.createUser();
		const offers = await getOffers(user.id, user.appId, {}, getDefaultLogger());
		console.log(offers.offers);
		const order = await createMarketplaceOrder(offers.offers[0].id, user, getDefaultLogger());
		const order2 = await createMarketplaceOrder(offers.offers[0].id, user, getDefaultLogger());

		expect(order.id).toBe(order2.id);
	});

});
