/**
 * This file populates a demo database for the sole sake of mocking data to populate our SDK client.
 * All the names of companies, products and KIN values are completely made up and are used for TESTING only.
 */
import * as fs from "fs";
import { User, AuthToken } from "./models/users";
import { Application } from "./models/applications";
import { Offer, OfferContent, AppOffer, Asset, OfferOwner } from "./models/offers";
import { Order } from "./models/orders";

import { init as initModels } from "./models";
import { getConfig } from "./config";
import { animalPoll, kikPoll, Poll, CouponInfo, CouponOrderContent } from "./services/offer_contents";

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
		orderTitle: string, orderDescription: string, orderCallToAction: string, orderContent: CouponOrderContent,
		coupon: CouponInfo): Promise<Offer> {

		const owner = new OfferOwner();
		owner.name = brand;
		await owner.save();

		const offer = new Offer();
		offer.amount = amount;
		offer.meta = {
			title, image, description,
			order_meta: {
				title: orderTitle,
				description: orderDescription,
				call_to_action: orderCallToAction,
				content: JSON.stringify(orderContent)
			}
		};
		offer.ownerId = owner.id;
		offer.type = "spend";
		offer.cap = { total: 100, used: 0, per_user: 2 };
		await offer.save();

		const content = new OfferContent();
		content.contentType = "coupon";
		content.offerId = offer.id;
		content.content = JSON.stringify(coupon);
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
		assetsBase + "spend_offer1.png", 8000, "Spotify", "month subscription",
		"show coupon", {
			title: "Your redeem code",
			description: "How to redeem:",
			link: "spotify.com/redeem"
		}, {
			title: "Redeem code",
			description: "Get a 1 week subscription for Spotify. Click on balance to get your code",
			amount: 8000,
			image: assetsBase + "coupon_1.png",
			confirmation: {
				title: "Thank you",
				description: "We will notify you when your redeem code is ready",
				image: assetsBase + "coupon_1.png"
			}
		}));
	offers.push(await createSpend("Sound Cloud", "Get Coupon", "month subscription",
		assetsBase + "spend_offer2.png", 6000, "Sound Cloud", "month subscription",
		"show coupon", {
			title: "Your redeem code",
			description: "How to redeem:",
			link: "Soundcloud.com/redeem"
		}, {
			title: "Redeem code",
			description: "Get a 1 week subscription for Soundcloud. Click on balance to get your code",
			amount: 6000,
			image: assetsBase + "coupon_2.png",
			confirmation: {
				title: "Thank you",
				description: "We will notify you when your gift card is ready",
				image: assetsBase + "coupon_2.png"
			}
		}));
	offers.push(await createSpend("asos", "Get Coupon", "month subscription",
		assetsBase + "spend_offer3.png", 6000, "asos", "month subscription",
		"show coupon", {
			title: "Your redeem code",
			description: "How to redeem:",
			link: "asos.com/redeem"
		}, {
			title: "Redeem code",
			description: "Get a $5 gift card for Asos. Click on balance to get your code",
			amount: 6000,
			image: assetsBase + "coupon_3.png",
			confirmation: {
				title: "Thank you",
				description: "We will notify you when your gift card is ready",
				image: assetsBase + "coupon_3.png"
			}
		}));
	offers.push(await createSpend("Dunkin Donuts", "Get Coupon", "month subscription",
		assetsBase + "spend_offer4.png", 6000, "Dunkin Donuts", "month subscription",
		"show coupon", {
			title: "Your redeem code",
			description: "How to redeem:",
			link: "DunkinDonut.com/redeem"
		}, {
			title: "Redeem code",
			description: "Get a $5 gift card for Dunkin Donuts. Click on balance to get your code",
			amount: 6000,
			image: assetsBase + "coupon_4.png",
			confirmation: {
				title: "Thank you",
				description: "We will notify you when your gift card is ready",
				image: assetsBase + "coupon_4.png"
			}
		}));
	offers.push(await createSpend("Sephora", "Get Coupon", "month subscription",
		assetsBase + "spend_offer5.png", 6000, "Sephora", "month subscription",
		"show coupon", {
			title: "Your redeem code",
			description: "How to redeem:",
			link: "Sephora.com/redeem"
		}, {
			title: "Redeem code",
			description: "Get a $5 gift card for Sephora. Click on balance to get your code",
			amount: 6000,
			image: assetsBase + "coupon_5.png",
			confirmation: {
				title: "Thank you",
				description: "We will notify you when your gift card is ready",
				image: assetsBase + "coupon_5.png"
			}
		}));

	return offers;
}

function orderFromOffer(offer: Offer, userId: string): Order {
	const order = new Order();
	order.userId = userId;
	order.offerId = offer.id;
	order.meta = offer.meta.order_meta;
	order.blockchainData = {
		transaction_id: "A123123123123123",
		recipient_address: "G123123123123",
		sender_address: "G123123123123"
	};
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

async function createApp(appId, apiKey, name) {
	const jwtPublic = fs.readFileSync("./examples/jwt_public_key.pem", "utf-8");
	const jwtPrivate = fs.readFileSync("./examples/jwt_private_key.pem", "utf-8");

	const app = new Application(appId, name, { 1: jwtPublic });
	app.apiKey = apiKey;  // XXX temporary run-over apiKey for testing
	await app.save();
	return app;
}

initModels().then(async () => {
	const user1 = await (new User("doody", "kik", "wallet1")).save();
	const user2 = await (new User("nitzan", "kik", "wallet2")).save();

	const authToken1 = await (new AuthToken(user1.id, "device1")).save();
	const authToken2 = await (new AuthToken(user2.id, "device2")).save();

	const app1 = await createApp("kik", Application.KIK_API_KEY, "Kik Messenger");
	const app2 = await createApp("sample", Application.SAMPLE_API_KEY, "Sample Application");

	const offers: Offer[] = await createOffers();

	for (const offer of offers) {
		for (const app of [app1, app2]) {
			const appOffer = new AppOffer();
			appOffer.appId = app.id;
			appOffer.offerId = offer.id;
			await appOffer.save();
		}
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
