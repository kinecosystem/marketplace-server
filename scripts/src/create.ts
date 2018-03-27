/**
 * This file populates a demo database for the sole sake of mocking data to populate our SDK client.
 * All the names of companies, products and KIN values are completely made up and are used for TESTING only.
 */
import { getConfig } from "./public/config"; // must be the first import

import * as fs from "fs";
import { AuthToken, User } from "./models/users";
import { Application } from "./models/applications";
import { AppOffer, Asset, Offer, OfferContent, OfferOwner } from "./models/offers";
import { Order } from "./models/orders";

import { init as initModels } from "./models";
import {
	CouponInfo,
	CouponOrderContent,
	kikPoll,
	kinPoll,
	Poll,
	tutorial,
	Tutorial,
	TUTORIAL_DESCRIPTION
} from "./public/services/offer_contents";

async function createOffers(): Promise<Offer[]> {
	const assetsBase = getConfig().assets_base;

	const offers: Offer[] = [];

	async function createEarn(
		brand: string, title: string, description: string, image: string, amount: number,
		orderTitle: string, orderDescription: string, poll: Poll | Tutorial): Promise<Offer> {

		const owner = OfferOwner.new({
			name: brand
		});
		await owner.save();

		const offer = Offer.new({
			amount,
			type: "earn",
			ownerId: owner.id,
			cap: { total: 100, used: 0, per_user: 2 },
			blockchainData: { sender_address: "GBOQY4LENMPZGBROR7PE5U3UXMK22OTUBCUISVEQ6XOQ2UDPLELIEC4J" },
			meta: { title, image, description, order_meta: { title: orderTitle, description: orderDescription } }
		});
		await offer.save();

		const content = OfferContent.new({
			contentType: "poll",
			offerId: offer.id,
			content: JSON.stringify(poll)
		});
		await content.save();

		return offer;
	}

	async function createSpend(
		brand: string, title: string, description: string, image: string, amount: number,
		orderTitle: string, orderDescription: string, orderCallToAction: string, orderContent: CouponOrderContent,
		coupon: CouponInfo): Promise<Offer> {

		const owner = OfferOwner.new({ name: brand });
		await owner.save();

		const offer = Offer.new({
			amount,
			type: "spend",
			ownerId: owner.id,
			cap: { total: 100, used: 0, per_user: 2 },
			meta: {
				title, image, description,
				order_meta: {
					title: orderTitle,
					description: orderDescription,
					call_to_action: orderCallToAction,
					content: JSON.stringify(orderContent)
				}
			},
			blockchainData: { recipient_address: "GBOQY4LENMPZGBROR7PE5U3UXMK22OTUBCUISVEQ6XOQ2UDPLELIEC4J" }
		});
		await offer.save();

		const content = OfferContent.new({
			contentType: "coupon",
			offerId: offer.id,
			content: JSON.stringify(Object.assign(coupon, { amount })) // replace coupon amount with offer amount
		});
		await content.save();

		return offer;
	}

	offers.push(await createEarn("Kin", "Learn More", TUTORIAL_DESCRIPTION,
		assetsBase + "earn_offer3.png", 20, "Getting started tutorial", "Completed Tutorial",
		tutorial));
	offers.push(await createEarn("Kik", "Tell us more", "Answer a poll",
		assetsBase + "earn_offer2.png", 20, "Kik", "Completed Poll",
		kikPoll));
	offers.push(await createEarn("Kin", "Tell us more", "Answer a poll",
		assetsBase + "kin_poll.png", 20, "Kin", "Completed Poll",
		kinPoll));

	offers.push(await createSpend("Spotify", "Get Coupon", "month subscription",
		assetsBase + "spend_offer1.png", 8, "Spotify", "month subscription",
		"show coupon", {
			title: "Your redeem code",
			description: "How to redeem:",
			link: "spotify.com/redeem",
			image: assetsBase + "coupon_1.png"
		}, {
			title: "Redeem code",
			description: "Get a 1 week subscription for Spotify. Click on balance to get your code",
			amount: 8,
			image: assetsBase + "coupon_1.png",
			confirmation: {
				title: "Thank you",
				description: "We will notify you when your redeem code is ready",
				image: assetsBase + "coupon_1.png"
			}
		}));
	offers.push(await createSpend("Sound Cloud", "Get Coupon", "month subscription",
		assetsBase + "spend_offer2.png", 6, "Sound Cloud", "month subscription",
		"show coupon", {
			title: "Your redeem code",
			description: "How to redeem:",
			link: "Soundcloud.com/redeem",
			image: assetsBase + "coupon_2.png"
		}, {
			title: "Redeem code",
			description: "Get a 1 week subscription for Soundcloud. Click on balance to get your code",
			amount: 6,
			image: assetsBase + "coupon_2.png",
			confirmation: {
				title: "Thank you",
				description: "We will notify you when your gift card is ready",
				image: assetsBase + "coupon_2.png"
			}
		}));
	offers.push(await createSpend("asos", "Get Coupon", "month subscription",
		assetsBase + "spend_offer3.png", 6, "asos", "month subscription",
		"show coupon", {
			title: "Your redeem code",
			description: "How to redeem:",
			link: "asos.com/redeem",
			image: assetsBase + "coupon_3.png"
		}, {
			title: "Redeem code",
			description: "Get a $5 gift card for Asos. Click on balance to get your code",
			amount: 6,
			image: assetsBase + "coupon_3.png",
			confirmation: {
				title: "Thank you",
				description: "We will notify you when your gift card is ready",
				image: assetsBase + "coupon_3.png"
			}
		}));
	offers.push(await createSpend("Dunkin Donuts", "Get Coupon", "month subscription",
		assetsBase + "spend_offer4.png", 6, "Dunkin Donuts", "month subscription",
		"show coupon", {
			title: "Your redeem code",
			description: "How to redeem:",
			link: "DunkinDonut.com/redeem",
			image: assetsBase + "coupon_4.png"
		}, {
			title: "Redeem code",
			description: "Get a $5 gift card for Dunkin Donuts. Click on balance to get your code",
			amount: 6,
			image: assetsBase + "coupon_4.png",
			confirmation: {
				title: "Thank you",
				description: "We will notify you when your gift card is ready",
				image: assetsBase + "coupon_4.png"
			}
		}));
	offers.push(await createSpend("Sephora", "Get Coupon", "month subscription",
		assetsBase + "spend_offer5.png", 6, "Sephora", "month subscription",
		"show coupon", {
			title: "Your redeem code",
			description: "How to redeem:",
			link: "Sephora.com/redeem",
			image: assetsBase + "coupon_5.png"
		}, {
			title: "Redeem code",
			description: "Get a $5 gift card for Sephora. Click on balance to get your code",
			amount: 6,
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
	const order = Order.new({
		userId,
		offerId: offer.id,
		amount: offer.amount,
		type: offer.type,
		status: "pending",
		meta: offer.meta.order_meta,
		blockchainData: {
			transaction_id: "A123123123123123",
			recipient_address: "G123123123123",
			sender_address: "G123123123123"
		}
	});

	return order;
}

async function createOrders(userId: string) {
	let offers = await Offer.find({ where: { type: "spend" }, take: 3 });
	let order = orderFromOffer(offers[0], userId);
	order.status = "completed";
	const asset = (await Asset.find({ where: { offerId: order.offerId, ownerId: null }, take: 1 }))[0];
	order.value = asset.asOrderValue(); // {coupon_code: 'xxxxxx', type: 'coupon'}
	await order.save();

	order = orderFromOffer(offers[1], userId);
	order.status = "failed";
	order.error = { message: "transaction timed out", error: "timeout", code: 4081 };
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
	order.error = { message: "transaction timed out", error: "timeout", code: 4081 };
	await order.save();

	order = orderFromOffer(offers[2], userId);
	order.status = "pending";
	await order.save();
}

async function createApp(appId: string, apiKey: string, name: string) {
	const jwtPublic = fs.readFileSync("./examples/jwt_public_key.pem", "utf-8");
	const jwtPrivate = fs.readFileSync("./examples/jwt_private_key.pem", "utf-8");

	const app = Application.new({
		id: appId,
		name,
		jwtPublicKeys: { 1: jwtPublic }
	});
	app.apiKey = apiKey;  // XXX temporary run-over apiKey for testing
	await app.save();
	return app;
}

initModels().then(async () => {
	const user1 = await (User.new({
		appUserId: "doody",
		appId: "kik",
		walletAddress: "wallet1"
	})).save();
	const user2 = await (User.new({
		appUserId: "nitzan",
		appId: "kik",
		walletAddress: "wallet2"
	})).save();

	const authToken1 = await (AuthToken.new({
		userId: user1.id,
		deviceId: "device1"
	})).save();
	const authToken2 = await (AuthToken.new({
		userId: user2.id,
		deviceId: "device2"
	})).save();

	const app1 = await createApp("kik", Application.KIK_API_KEY, "Kik Messenger");
	const app2 = await createApp("sample", Application.SAMPLE_API_KEY, "Sample Application");

	const offers: Offer[] = await createOffers();

	for (const offer of offers) {
		for (const app of [app1, app2]) {
			const appOffer = AppOffer.new({
				appId: app.id,
				offerId: offer.id
			});
			await appOffer.save();
		}
		for (let i = 0; i < offer.cap.total; i++) {
			const asset = Asset.new({
				offerId: offer.id,
				type: "coupon",
				value: { coupon_code: `XXXX-${offer.id}-${i}` }
			});
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
