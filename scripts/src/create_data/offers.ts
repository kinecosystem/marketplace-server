import { Asset, Offer, OfferContent, OfferOwner } from "../models/offers";
import { CouponInfo, CouponOrderContent, Poll, Tutorial } from "../public/services/offer_contents";

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
	couponCodes: string[]) {

	const owner = await getOrCreateOwner(brand);

	const orderContent: CouponOrderContent = {
		title: orderContentTitle,
		description: orderContentSubtitle,
		link: orderContentHyperLink,
		image: orderContentImage
	};

	const couponInfo: CouponInfo = {
		title: couponTitle,
		description: couponDescription,
		amount,
		image: couponImage,
		confirmation: {
			title: couponConfirmTitle,
			description: couponConfirmSubtitle,
			image: couponConfirmImage
		}
	};

	const offer = Offer.new({
		name: offerName,
		amount,
		type: "spend",
		ownerId: owner.id,
		cap: { total: capTotal, per_user: capPerUser },
		meta: {
			title, image, description,
			order_meta: {
				title: orderTitle,
				description: orderDescription,
				call_to_action: orderCallToAction,
				content: JSON.stringify(orderContent)
			}
		},
		blockchainData: { recipient_address: walletAddress }
	});
	await offer.save();

	const content = OfferContent.new({
		contentType: "coupon",
		offerId: offer.id,
		content: JSON.stringify(couponInfo)
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

	return offer;
}

export async function createEarn(
	offerName: string, walletAddress: string,
	brand: string, title: string, description: string, image: string, amount: number,
	capTotal: number, capPerUser: number,
	orderTitle: string, orderDescription: string, poll: Poll | Tutorial): Promise<Offer> {

	const owner = await getOrCreateOwner(brand);

	const offer = Offer.new({
		name: offerName,
		amount,
		type: "earn",
		ownerId: owner.id,
		cap: { total: capTotal, per_user: capPerUser },
		meta: {
			title, image, description,
			order_meta: {
				title: orderTitle,
				description: orderDescription,
			}
		},
		blockchainData: { recipient_address: walletAddress }
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
