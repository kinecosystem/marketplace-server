import { LoggerInstance } from "winston";

import * as db from "../../models/offers";

import { Paging, ServiceResult } from "./index";
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
	blockchain_data: db.BlockchainData;
	content: string;
	content_type: "coupon" | "poll";
	offer_type: "earn" | "spend";
}

export interface OfferList {
	offers: Offer[];
	paging: Paging;
}

export async function getOffers(
	userId: string, appId: string, logger: LoggerInstance): Promise<OfferList> {
	// const appOffers = await getManager().query(
	// `SELECT offers.*
	//  FROM offers
	//  JOIN app_offers
	//  ON offers.id = app_offers.offer_id
	//  AND app_offers.app_id = ${appId}`
	// );
	const dbOffers = await db.Offer.find();
	const offers: Offer[] = await Promise.all(
		dbOffers
			.map(async offer => {
				const content = await offerContents.getOffer(offer.id, logger);

				if (!content) {
					return null;
				}

				return {
					id: offer.id,
					title: offer.meta.title,
					description: offer.meta.description,
					image: offer.meta.image,
					amount: offer.amount,
					blockchain_data: offer.blockchainData,
					offer_type: offer.type,
					content: content.content,
					content_type: content.contentType,
				};
			})
			.filter<Offer>(offer => offer !== null));
	
	return { offers, paging: { cursors: {} } };
}
