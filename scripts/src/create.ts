import { User, AuthToken, Application } from "./models/users";
import { Offer, OfferContent, AppOffer, Asset, OfferOwner } from "./models/offers";
// import { Order } from "./models/orders";

import { init as initModels } from "./models";

initModels().then(async () => {
	const user1 = await (new User("doody", "kik", "wallet1")).save();
	const user2 = await (new User("nitzan", "kik", "wallet2")).save();

	await (new AuthToken(user1.id, "device1", true)).save();
	await (new AuthToken(user2.id, "device2", true)).save();

	const app: Application = await (new Application("kik", "jwt")).save();

	const owner = new OfferOwner();
	owner.name = "donuts";
	await owner.save();

	const offer = new Offer();
	offer.amount = 4000;
	offer.meta = { title: "offer title", image: "image", description: "the description" };
	offer.ownerId = owner.id;
	offer.type = "earn";
	offer.cap = { total: 100, used: 0, per_user: 2 };
	await offer.save();

	const content = new OfferContent();
	content.contentType = "poll";
	content.offerId = offer.id;
	content.content = JSON.stringify({ pages: [{ title: "question1" }] });
	await content.save();

	const appOffer = new AppOffer();
	appOffer.appId = app.id;
	appOffer.offerId = offer.id;
	await appOffer.save();

	const asset = new Asset();
	asset.ownerId = null;
	asset.type = "coupon";
	asset.value = { coupon_code: "xxxxxxxxxxx" };
	await asset.save();
});
