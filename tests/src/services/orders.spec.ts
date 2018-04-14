import { getConfig } from "../../../scripts/bin/public/config"; // must be the first import
getConfig();

import * as helpers from "../helpers";
import { init as initModels } from "../../../scripts/bin/models/index";
import { Order } from "../../../scripts/bin/models/orders";
import { User } from "../../../scripts/bin/models/users";

describe("test orders", async () => {
	beforeAll(async () => {
		await initModels();

		const user = await helpers.createUser();
		await helpers.createOffers();
		await helpers.createOrders(user.id);
	});

	test("test getAllNonOpen", async () => {
		const user = (await User.find())[0];
		console.log(user);
		const orders = await Order.getAll(user.id, "!opened", 25);
		console.log(orders);
	});
});
