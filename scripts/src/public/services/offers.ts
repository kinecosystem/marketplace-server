import { LoggerInstance } from "winston";

import { ModelFilters } from "../../models/index";
import * as db from "../../models/offers";

import { Paging } from "./index";
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

async function filterOffers(offers: db.Offer[], logger: LoggerInstance): Promise<Offer[]> {
	return await Promise.all(
		offers
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
			.filter(offer => offer !== null)) as Offer[];
}

export async function getOffers(userId: string, appId: string, filters: ModelFilters<db.Offer>, logger: LoggerInstance): Promise<OfferList> {
	let offers = [] as Offer[];

	if (filters.type !== "earn") {
		offers = offers.concat(await filterOffers(await db.Offer.find({ where: { type: "earn" }, order: { amount: "ASC" } }), logger));
	}

	if (filters.type !== "spend") {
		offers = offers.concat(await filterOffers(await db.Offer.find({ where: { type: "spend" }, order: { amount: "DESC" } }), logger));
	}

	return { offers, paging: { cursors: {} } };
}
