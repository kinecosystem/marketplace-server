import { Asset, Cap, ContentType, Offer, OfferContent, OfferOwner } from "../models/offers";
import { CouponOrderContent, Poll, Quiz, Tutorial } from "../public/services/offer_contents";
import { Application, AppOffer } from "../models/applications";

async function getOrCreateOwner(brandName: string): Promise<OfferOwner> {
	let owner = await OfferOwner.findOne({ name: brandName });
	if (owner) {
		return owner;
	}
	owner = OfferOwner.new({ name: brandName });
	await owner.save();
	return owner;
}

export async function createSpend(
	offerName: string, walletAddress: string,
	brand: string, title: string, description: string, image: string, amount: number,
	capTotal: number, capPerUser: number,
	orderTitle: string, orderDescription: string, orderCallToAction: string,
	couponImage: string, couponTitle: string, couponDescription: string,
	couponConfirmImage: string, couponConfirmTitle: string, couponConfirmSubtitle: string,
	orderContentImage: string, orderContentTitle: string, orderContentSubtitle: string, orderContentHyperLink: string,
	couponCodes: string[],
	appList?: string[]): Promise<Offer> {

	const existingOffer = await Offer.findOne({ name: offerName });
	if (existingOffer) {
		console.log(`existing offer: ${offerName}`);
		return existingOffer;
	}

	const owner = await getOrCreateOwner(brand);

	const orderContent: CouponOrderContent = {
		title: orderContentTitle,
		description: orderContentSubtitle,
		link: orderContentHyperLink,
		image: orderContentImage
	};

	const couponInfo: string = `{
		"title": "${couponTitle}",
		"description": "${couponDescription}",
		"amount": \${amount.raw},
		"image": "${couponImage}",
		"confirmation": {
			"title": "${couponConfirmTitle}",
			"description": "${couponConfirmSubtitle}",
			"image": "${couponConfirmImage}"
		}
	}`;

	const offer = Offer.new({
		name: offerName,
		amount,
		type: "spend",
		ownerId: owner.id,
		meta: {
			title, image, description,
			order_meta: {
				title: orderTitle,
				description: orderDescription,
				call_to_action: orderCallToAction,
				content: JSON.stringify(orderContent)
			}
		},
	});
	await offer.save();

	const content = OfferContent.new({
		contentType: "coupon",
		offerId: offer.id,
		content: couponInfo

	});
	await content.save();

	for (const couponCode of couponCodes) {
		if (!couponCode || couponCode === "") {
			continue;
		}
		const asset = Asset.new({
			offerId: offer.id,
			type: "coupon",
			value: { coupon_code: couponCode }
		});
		await asset.save();
	}

	await saveAppOffers(offer, { total: capTotal, per_user: capPerUser }, walletAddress, appList);
	return offer;
}

export type EarnOptions = {
	doNotUpdateExiting?: boolean; // Should existing offers be updated
	onlyUpdate?: boolean; // Don't create new offers, only update existing.
	dryRun?: boolean;  // if true, only process data, don't change/insert into the DB
	confirmUpdate?: boolean;  //
	onlyUpdateMetaImage?: boolean;
	verbose?: boolean;
};

export async function createEarn(
	offerName: string, walletAddress: string,
	brand: string, title: string, description: string, image: string, amount: number,
	capTotal: number, capPerUser: number,
	orderTitle: string, orderDescription: string, contentType: ContentType,
	poll: Quiz | Poll | Tutorial,
	appList: string[] = [],
	options: EarnOptions = {}): Promise<Offer | null> {

	const existingOffer = await Offer.findOne({ name: offerName });
	let offer;
	let content;
	if (existingOffer) {
		if (options.doNotUpdateExiting) {
			options.verbose && console.log(`existing offer: ${offerName}`);
			return existingOffer;
		}
		offer = existingOffer;
		options.verbose && console.log("Updating earn offer %s id %s", offer.name, offer.id, options.dryRun ? "(dry run)" : "");
		content = await OfferContent.findOne({ offerId: offer.id });
	} else {
		if (options.onlyUpdate) {
			options.verbose && console.log(`Skipping offer creation for offer: ${ offerName }`);
			return Promise.resolve(null);
		}
		const owner = await getOrCreateOwner(brand);
		offer = Offer.new({ name: offerName, ownerId: owner.id, type: "earn" });
		options.verbose && console.log("Creating earn offer %s id %s", offer.name, offer.id, options.dryRun ? "(dry run)" : "");
	}

	if (!content) {
		content = OfferContent.new({
			contentType,
			offerId: offer.id
		});
	}

	if (options.onlyUpdateMetaImage) {
		offer.meta.image = image;
	} else {
		offer.amount = amount;
		offer.meta = {
			title,
			image,
			description,
			order_meta: {
				title: orderTitle,
				description: orderDescription,
			}
		};
		content.content = JSON.stringify(poll);
	}

	if (!options.dryRun) {
		await offer.save();
		await content.save();
	}

	await saveAppOffers(offer, { total: capTotal, per_user: capPerUser }, walletAddress, appList, options);
	return offer;
}

async function saveAppOffers(offer: Offer, cap: Cap, walletAddress: string, appList: string[] = [], options: EarnOptions = {}) {
	if (appList[0] === "ALL") {
		appList = (await Application.find({ select: ["id"] })).map(app => app.id);
	}
	await Promise.all(appList.map(async appId => {
		let appOffer = await AppOffer.findOne({ appId, offerId: offer.id });
		appOffer && options.verbose && console.log("Updating AppOffer for offer %s id %s, App:", offer.name, offer.id, appId, options.dryRun ? "(dry run)" : "");

		if (!appOffer) {
			options.verbose && console.log("Creating AppOffer for offer %s id %s, App:", offer.name, offer.id, appId, options.dryRun ? "(dry run)" : "");
			appOffer = await AppOffer.create({ appId, offerId: offer.id });
		}
		appOffer.walletAddress = walletAddress;
		appOffer.cap = cap;
		!options.dryRun && await appOffer.save();
	}));
}
