import { User, AuthToken, Application } from "./models/users";
import { Offer, OfferContent, AppOffer, Asset, OfferOwner } from "./models/offers";

import { init as initModels } from "./models";
import { getConfig } from "./config";
import { forEachToken } from "tslint";

const poll = {
	pages: [{
		description: "what color do you like?",
		answers: ["red", "green", "blue"],
		title: "hi there",
	}, {
		description: "whats up?",
		answers: ["good", "bad", "ok"],
		title: "hi there",
	}],
};

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
		content.content = JSON.stringify(poll);
		await content.save();

		offers.push(offer);
	}

	for (const img of spends) {
		const owner = new OfferOwner();
		owner.name = "spotify";
		await owner.save();

		const offer = new Offer();
		offer.amount = 8000;
		offer.meta = { title: "Tell us about yourself", image: img, description: "$10 gift card" };
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

initModels().then(async () => {
	const user1 = await (new User("doody", "kik", "wallet1")).save();
	const user2 = await (new User("nitzan", "kik", "wallet2")).save();

	await (new AuthToken(user1.id, "device1", true)).save();
	await (new AuthToken(user2.id, "device2", true)).save();

	const app = await (new Application("kik", "jwt")).save();

	const offers: Offer[] = await createOffers();

	for (const offer of offers) {
		const appOffer = new AppOffer();
		appOffer.appId = app.id;
		appOffer.offerId = offer.id;
		await appOffer.save();
	}

	const asset = new Asset();
	asset.ownerId = null;
	asset.type = "coupon";
	asset.value = { coupon_code: "xxxxxxxxxxx" };
	await asset.save();
});
