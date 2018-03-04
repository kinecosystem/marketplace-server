/**
 * This file populates a demo database for the sole sake of mocking data to populate our SDK client.
 * All the names of companies, products and KIN values are completely made up and are used for TESTING only.
 */
import { User, AuthToken } from "./models/users";
import { Application } from "./models/applications";
import { Offer, OfferContent, AppOffer, Asset, OfferOwner } from "./models/offers";
import { Order } from "./models/orders";

import { init as initModels } from "./models";
import { getConfig } from "./config";
import { animalPoll, kikPoll, Poll } from "./services/offer_contents";

async function createOffers(): Promise<Offer[]> {
	const assetsBase = getConfig().assets_base;

	const offers: Offer[] = [];

	async function createEarn(
		brand: string, title: string, description: string, image: string, amount: number,
		orderTitle: string, orderDescription: string, poll: Poll): Promise<Offer> {

		const owner = new OfferOwner();
		owner.name = brand;
		await owner.save();

		const offer = new Offer();
		offer.amount = amount;
		offer.meta = { title, image, description, order_meta: { title: orderTitle, description: orderDescription } };
		offer.ownerId = owner.id;
		offer.type = "earn";
		offer.cap = { total: 100, used: 0, per_user: 2 };
		await offer.save();

		const content = new OfferContent();
		content.contentType = "poll";
		content.offerId = offer.id;

		content.content = JSON.stringify(poll);

		await content.save();

		return offer;
	}

	async function createSpend(
		brand: string, title: string, description: string, image: string, amount: number,
		orderTitle: string, orderDescription: string, orderCallToAction: string): Promise<Offer> {

		const owner = new OfferOwner();
		owner.name = brand;
		await owner.save();

		const offer = new Offer();
		offer.amount = amount;
		offer.meta = {
			title, image, description,
			order_meta: { title: orderTitle, description: orderDescription, call_to_action: orderCallToAction }
		};
		offer.ownerId = owner.id;
		offer.type = "spend";
		offer.cap = { total: 100, used: 0, per_user: 2 };
		await offer.save();

		const content = new OfferContent();
		content.contentType = "coupon";
		content.offerId = offer.id;
		content.content = "approve payment";
		await content.save();

		return offer;
	}

	offers.push(await createEarn("Dunkin Donuts", "Sweet tooth?", "Answer a poll",
		assetsBase + "earn_offer1.png", 2000, "Dunkin Donuts", "Completed Poll",
		animalPoll));
	offers.push(await createEarn("Kik", "Tell us more", "Answer a poll",
		assetsBase + "earn_offer2.png", 2500, "Kik", "Completed Poll",
		kikPoll));
	offers.push(await createEarn("Kin", "Learn More", "Kin Tutorial",
		assetsBase + "earn_offer3.png", 1500, "Kin", "Completed Tutorial",
		kikPoll));
	offers.push(await createEarn("McDonald's", "Big Mac fan?", "Answer a poll",
		assetsBase + "earn_offer4.png", 2750, "McDonald's", "Completed Poll",
		animalPoll));
	offers.push(await createEarn("Nike", "Run or walk?", "Answer a poll",
		assetsBase + "earn_offer5.png", 3000, "Nike", "Completed Poll",
		animalPoll));

	offers.push(await createSpend("Spotify", "Get Coupon", "month subscription",
		assetsBase + "spend_offer1.png", 6000, "Spotify", "month subscription",
		"show coupon"));
	offers.push(await createSpend("Sound Cloud", "Get Coupon", "month subscription",
		assetsBase + "spend_offer2.png", 6000, "Sound Cloud", "month subscription",
		"show coupon"));
	offers.push(await createSpend("asos", "Get Coupon", "month subscription",
		assetsBase + "spend_offer3.png", 6000, "asos", "month subscription",
		"show coupon"));
	offers.push(await createSpend("Dunkin Donuts", "Get Coupon", "month subscription",
		assetsBase + "spend_offer4.png", 6000, "Dunkin Donuts", "month subscription",
		"show coupon"));
	offers.push(await createSpend("Sephora", "Get Coupon", "month subscription",
		assetsBase + "spend_offer5.png", 6000, "Sephora", "month subscription",
		"show coupon"));

	return offers;
}

function orderFromOffer(offer: Offer, userId: string): Order {
	const order = new Order();
	order.userId = userId;
	order.offerId = offer.id;
	order.meta = Object.assign({}, offer.meta, { call_to_action: "press here" });
	order.blockchainData = { transaction_id: "xxx", recipient_address: "reere", sender_address: "err" };
	order.amount = offer.amount;
	order.type = offer.type;

	return order;
}

async function createOrders(userId: string) {
	let offers = await Offer.find({ where: { type: "spend" }, take: 3 });
	let order = orderFromOffer(offers[0], userId);
	order.status = "completed";
	const asset = (await Asset.find({ where: { offerId: order.offerId, ownerId: null }, take: 1 }))[0];
	order.value = asset.value;
	await order.save();

	order = orderFromOffer(offers[1], userId);
	order.status = "failed";
	order.value = { failure_message: "transaction timed out" };
	await order.save();

	order = orderFromOffer(offers[2], userId);
	order.status = "pending";
	await order.save();

	offers = await Offer.find({ where: { type: "earn" }, take: 3 });
	order = orderFromOffer(offers[0], userId);
	order.status = "completed";
	await order.save();

	order = orderFromOffer(offers[1], userId);
	order.status = "failed";
	order.value = { failure_message: "transaction timed out" };
	await order.save();

	order = orderFromOffer(offers[2], userId);
	order.status = "pending";
	await order.save();
}

async function createApp() {
	const jwtPublic = "-----BEGIN PUBLIC KEY-----\n" +
		"MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDdlatRjRjogo3WojgGHFHYLugdUWAY9iR3fy4arWNA1KoS8" +
		"kVw33cJibXr8bvwUAUparCwlvdbH6dvEOfou0/gCFQsHUfQrSDv+MuSUMAe8jzKE4qW+jK+xQU9a03GUnKHkk" +
		"le+Q0pX/g6jXZ7r1/xAK5Do2kQ+X5xK9cipRgEKwIDAQAB\n" +
		"-----END PUBLIC KEY-----";
	const jwtPrivate = "-----BEGIN RSA PRIVATE KEY-----\n" +
		"MIICWwIBAAKBgQDdlatRjRjogo3WojgGHFHYLugdUWAY9iR3fy4arWNA1KoS8kVw33cJibXr8bvwUAUparCwl" +
		"vdbH6dvEOfou0/gCFQsHUfQrSDv+MuSUMAe8jzKE4qW+jK+xQU9a03GUnKHkkle+Q0pX/g6jXZ7r1/xAK5Do2" +
		"kQ+X5xK9cipRgEKwIDAQABAoGAD+onAtVye4ic7VR7V50DF9bOnwRwNXrARcDhq9LWNRrRGElESYYTQ6EbatX" +
		"S3MCyjjX2eMhu/aF5YhXBwkppwxg+EOmXeh+MzL7Zh284OuPbkglAaGhV9bb6/5CpuGb1esyPbYW+Ty2PC0GS" +
		"ZfIXkXs76jXAu9TOBvD0ybc2YlkCQQDywg2R/7t3Q2OE2+yo382CLJdrlSLVROWKwb4tb2PjhY4XAwV8d1vy0" +
		"RenxTB+K5Mu57uVSTHtrMK0GAtFr833AkEA6avx20OHo61Yela/4k5kQDtjEf1N0LfI+BcWZtxsS3jDM3i1Hp" +
		"0KSu5rsCPb8acJo5RO26gGVrfAsDcIXKC+bQJAZZ2XIpsitLyPpuiMOvBbzPavd4gY6Z8KWrfYzJoI/Q9FuBo" +
		"6rKwl4BFoToD7WIUS+hpkagwWiz+6zLoX1dbOZwJACmH5fSSjAkLRi54PKJ8TFUeOP15h9sQzydI8zJU+upvD" +
		"EKZsZc/UhT/SySDOxQ4G/523Y0sz/OZtSWcol/UMgQJALesy++GdvoIDLfJX5GBQpuFgFenRiRDabxrE9MNUZ" +
		"2aPFaFp+DyAe+b4nDwuJaW2LURbr8AEZga7oQj0uYxcYw==\n" +
		"  -----END RSA PRIVATE KEY-----";

	const app = new Application("kik", "Kik Messenger", { 1: jwtPublic });
	app.apiKey = Application.KIK_API_KEY;  // XXX temporary run-over apiKey for testing
	await app.save();
	return app;
}

initModels().then(async () => {
	const user1 = await (new User("doody", "kik", "wallet1")).save();
	const user2 = await (new User("nitzan", "kik", "wallet2")).save();

	const authToken1 = await (new AuthToken(user1.id, "device1")).save();
	const authToken2 = await (new AuthToken(user2.id, "device2")).save();

	const app = await createApp();

	const offers: Offer[] = await createOffers();

	for (const offer of offers) {
		const appOffer = new AppOffer();
		appOffer.appId = app.id;
		appOffer.offerId = offer.id;
		await appOffer.save();
		for (let i = 0; i < offer.cap.total; i++) {
			const asset = new Asset();
			asset.offerId = offer.id;
			asset.ownerId = null;
			asset.type = "coupon";
			asset.value = { coupon_code: "xxxxxxxxxxx" };
			await asset.save();
		}
	}
	await createOrders(user1.id);
	await createOrders(user2.id);

	console.log(`created user1: user_id: ${user1.appUserId}, app_id: ${user1.appId}, device_id: ${authToken1.deviceId},`
		+ ` token: ${authToken1.id}`);
	console.log(`created user2: user_id: ${user2.appUserId}, app_id: ${user2.appId}, device_id: ${authToken2.deviceId},`
		+ ` token: ${authToken2.id}`);
}).catch((error: Error) => {
	console.log("error: " + error.message + "\n" + error.stack);
});
