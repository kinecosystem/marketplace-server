import { getConfig } from "../../../scripts/bin/public/config";
import { OpenOrder } from "../../../scripts/bin/models/orders";

getConfig();

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
