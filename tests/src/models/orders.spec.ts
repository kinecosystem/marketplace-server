import mock = require("supertest");

import { app } from "../../../scripts/bin/public/app";
import { OpenOrder } from "../../../scripts/src/models/orders";

describe("test openApi Redis integration", async () => {
	test("get should return what set inserted", async () => {
		const nonExistant = await OpenOrder.findOneById("non_existant");
		expect(nonExistant).toEqual(undefined);
		const order = new OpenOrder("offer_id", "user_id");
		const notFound = await OpenOrder.findOneById(order.id);
		expect(notFound).toEqual(undefined);
		await order.save();
		const found = await OpenOrder.findOneById(order.id);
		expect(found).toEqual(order);
		await order.delete();
		const deleted = await OpenOrder.findOneById(order.id);
		expect(deleted).toEqual(undefined);
	});
});
