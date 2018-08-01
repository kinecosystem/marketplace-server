import { LoggerInstance } from "winston";

import * as metrics from "../../metrics";
import * as db from "../../models/offers";
import { ModelFilters } from "../../models/index";
import * as dbOrders from "../../models/orders";
import { Paging } from "./index";
import * as offerContents from "./offer_contents";
import { Application } from "../../models/applications";
import { ContentType, OfferType } from "../../models/offers";
import { getConfig } from "../config";

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
	content_type: ContentType;
	offer_type: OfferType;
}

export interface OfferList {
	offers: Offer[];
	paging: Paging;
}

function offerDbToApi(offer: db.Offer, content: db.OfferContent) {
	content.content = offerContents.replaceTemplateVars(offer, content.content);
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
}

async function filterOffers(userId: string, app: Application | undefined, logger: LoggerInstance): Promise<Offer[]> {
	// TODO: this should be a temp fix!
	// the app should not be undefined as we used left join, figure it out
	if (!app) {
		return [];
	}

	return (await Promise.all(
		app.offers
			.map(async offer => {
				if (await offer.didExceedCap(userId)) {
					return null;
				}

				const content = await offerContents.getOfferContent(offer.id, logger);

				if (!content) {
					return null;
				}

				return offerDbToApi(offer, content);
			})
	)).filter(offer => offer !== null) as Offer[];
}

export async function getOffers(userId: string, appId: string, filters: ModelFilters<db.Offer>, logger: LoggerInstance): Promise<OfferList> {
	let offers = [] as Offer[];

	const query = Application.createQueryBuilder("app")
		.where("app.id = :appId", { appId })
		.leftJoinAndSelect("app.offers", "offer");

	if (!filters.type || filters.type === "earn") {
		offers = offers.concat(
			await filterOffers(
				userId,
				await query
					.andWhere("offer.type = :type", { type: "earn" })
					.orderBy("offer.amount", "DESC")
					.addOrderBy("offer.id", "ASC")
					.getOne(),
				logger
			)
		);
		// global earn capping
		const max_daily_earn_offers = getConfig().max_daily_earn_offers;
		if (max_daily_earn_offers !== null) {
			offers = offers.slice(0, Math.max(0, max_daily_earn_offers - await dbOrders.Order.countToday(userId, "earn")));
		}
	}

	if (!filters.type || filters.type === "spend") {
		offers = offers.concat(
			await filterOffers(
				userId,
				await query
					.andWhere("offer.type = :type", { type: "spend" })
					.orderBy("offer.amount", "ASC")
					.addOrderBy("offer.id", "ASC")
					.getOne(),
				logger
			)
		);
	}

	metrics.offersReturned(offers.length, appId);
	return { offers, paging: { cursors: {} } };
}
