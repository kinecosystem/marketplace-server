import { getManager } from "typeorm";
import { LoggerInstance } from "winston";

import { ModelFilters } from "../../models/index";
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

export async function getOffers(userId: string, appId: string, filters: ModelFilters<db.Offer>, logger: LoggerInstance): Promise<OfferList> {
	const earnQuery = db.Offer
		.createQueryBuilder()
		.where("type = 'earn'")
		.orderBy("amount", "ASC").getSql();

	const spendQuery = db.Offer
		.createQueryBuilder()
		.where("type = 'spend'")
		.orderBy("amount", "DESC").getSql();

	let dbOffers: db.Offer[];
	switch (filters.type) {
		case "earn":
			dbOffers = await getManager().query(earnQuery);
			break;

		case "spend":
			dbOffers = await getManager().query(spendQuery);
			break;

		default:
			dbOffers = await getManager().query(`${ earnQuery } UNION ${ spendQuery }`);
			break;
	}

	const offers = await Promise.all(
		dbOffers.map(async offer => {
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

	return { offers, paging: { cursors: {} } };
}
