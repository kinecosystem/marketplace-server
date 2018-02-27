import { User, AuthToken, Application } from "./models/users";
import { Offer, OfferContent, AppOffer, Asset, OfferOwner } from "./models/offers";
import { Order } from "./models/orders";

import { init as initModels } from "./models";
import { getConfig } from "./config";
import { poll1, poll2 } from "./services/offer_contents";

async function createOffers(): Promise<Offer[]> {
	const earns = [
		"earn_offer1.png",
		"earn_offer2.png",
		"earn_offer3.png",
		"earn_offer4.png",
		"earn_offer5.png",
	];
	const spends = [
		"spend_offer1.png",
		"spend_offer2.png",
		"spend_offer3.png",
		"spend_offer4.png",
		"spend_offer5.png",
	];
	const assetsBase = getConfig().assets_base;

	const offers: Offer[] = [];

	let i = 1;
	for (const img of earns) {
		const owner = new OfferOwner();
		owner.name = "dunkin donuts";
		await owner.save();

		const offer = new Offer();
		offer.amount = 4000;
		offer.meta = { title: "Tell us about yourself", image: assetsBase + img, description: "the description" };
		offer.ownerId = owner.id;
		offer.type = "earn";
		offer.cap = { total: 100, used: 0, per_user: 2 };
		await offer.save();

		const content = new OfferContent();
		content.contentType = "poll";
		content.offerId = offer.id;

		content.content = JSON.stringify([poll1, poll2][i]);
		i = 1 - i;

		await content.save();

		offers.push(offer);
	}

	for (const img of spends) {
		const owner = new OfferOwner();
		owner.name = "spotify";
		await owner.save();

		const offer = new Offer();
		offer.amount = 8000;
		offer.meta = { title: "Tell us about yourself", image: assetsBase + img, description: "$10 gift card" };
		offer.ownerId = owner.id;
		offer.type = "spend";
		offer.cap = { total: 100, used: 0, per_user: 2 };
		await offer.save();

		const content = new OfferContent();
		content.contentType = "coupon";
		content.offerId = offer.id;
		content.content = "approve payment";
		await content.save();

		offers.push(offer);
	}

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
	order.value = { reason: "transaction timed out" };
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
	order.value = { reason: "transaction timed out" };
	await order.save();

	order = orderFromOffer(offers[2], userId);
	order.status = "pending";
	await order.save();
}

initModels().then(async () => {
	const user1 = await (new User("doody", "kik", "wallet1")).save();
	const user2 = await (new User("nitzan", "kik", "wallet2")).save();

	const authToken1 = await (new AuthToken(user1.id, "device1", true)).save();
	const authToken2 = await (new AuthToken(user2.id, "device2", true)).save();

	const app = await (new Application("kik", "jwt")).save();

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
});
