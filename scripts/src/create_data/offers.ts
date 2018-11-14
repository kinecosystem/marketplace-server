import { Asset, Cap, ContentType, Offer, OfferContent, OfferOwner } from "../models/offers";
import { CouponInfo, CouponOrderContent, Poll, Quiz, Tutorial } from "../public/services/offer_contents";
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
	appList: string[]): Promise<Offer> {

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

export async function createEarn(
	offerName: string, walletAddress: string,
	brand: string, title: string, description: string, image: string, amount: number,
	capTotal: number, capPerUser: number,
	orderTitle: string, orderDescription: string, contentType: ContentType,
	poll: Quiz | Poll | Tutorial,
	appList: string[]): Promise<Offer> {

	const existingOffer = await Offer.findOne({ name: offerName });
	if (existingOffer) {
		console.log(`existing offer: ${offerName}`);
		return existingOffer;
	}

	const owner = await getOrCreateOwner(brand);

	const offer = Offer.new({
		name: offerName,
		amount,
		type: "earn",
		ownerId: owner.id,
		meta: {
			title, image, description,
			order_meta: {
				title: orderTitle,
				description: orderDescription,
			}
		},
	});

	await offer.save();

	const content = OfferContent.new({
		contentType,
		offerId: offer.id,
		content: JSON.stringify(poll)
	});
	await content.save();

	await saveAppOffers(offer, { total: capTotal, per_user: capPerUser }, walletAddress, appList);
	return offer;
}

async function saveAppOffers(offer: Offer, cap: Cap, walletAddress: string, appList: string[]) {
	appList.forEach( async appId => {
		await AppOffer.create({ appId, offerId: offer.id, walletAddress, cap }).save();
	});
}
