import { Paging, ServiceResult } from "./index";
import * as db from "../models/offers";
import * as offerContents from "./offer_contents";

export interface PollAnswer {
	content_type: "PollAnswer";
	answers: { [key: string]: string };
}

export interface Offer {
	id: string;
	title: string;
	description: string;
	image: string;
	amount: number;
	content: string;
	content_type: "coupon" | "poll";
	offer_type: "earn" | "spend";
}

export interface OfferList {
	offers: Offer[];
	paging: Paging;
}

export async function getOffers(userId: string, appId: string): Promise<OfferList> {
	// const appOffers = await getManager().query(
	// `SELECT offers.*
	//  FROM offers
	//  JOIN app_offers
	//  ON offers.id = app_offers.offer_id
	//  AND app_offers.app_id = ${appId}`
	// );
	const dbOffers = await db.Offer.find();
	const offers: Offer[] = await Promise.all(
		dbOffers.map(async offer => {
			const content: db.OfferContent = await offerContents.getOffer(offer.id);
			return {
				id: offer.id,
				title: offer.meta.title,
				description: offer.meta.description,
				image: offer.meta.image,
				amount: offer.amount,
				offer_type: offer.type,
				content: content.content,
				content_type: content.contentType,
			};
		}));
	return { offers, paging: { cursors: {} } };
}
