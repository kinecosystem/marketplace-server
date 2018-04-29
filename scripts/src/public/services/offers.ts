import { LoggerInstance } from "winston";

import * as metrics from "../../metrics";
import * as db from "../../models/offers";
import * as dbOrder from "../../models/orders";
import { ModelFilters } from "../../models/index";

import { Paging } from "./index";
import * as offerContents from "./offer_contents";
import { Application } from "../../models/applications";

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

function offerDbToApi(offer: db.Offer, content: db.OfferContent) {
	function replaceTemplateVars(template: string) {
		// XXX currently replace here instead of client
		return template.replace(/\${amount}/g, offer.amount.toLocaleString("en-US"));
	}

	return {
		id: offer.id,
		title: offer.meta.title,
		description: offer.meta.description,
		image: offer.meta.image,
		amount: offer.amount,
		blockchain_data: offer.blockchainData,
		offer_type: offer.type,
		content: replaceTemplateVars(content.content),
		content_type: content.contentType,
	};
}

async function filterOffers(userId: string, offers: db.Offer[], logger: LoggerInstance): Promise<Offer[]> {
	return (await Promise.all(
		offers
			.map(async offer => {
				if (await offer.didExceedCap(userId)) {
					return null;
				}

				const content = await offerContents.getOffer(offer.id, logger);

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
				(await query
					.andWhere("offer.type = :type", { type: "earn" })
					.orderBy("offer.amount", "DESC")
					.addOrderBy("offer.id", "ASC")
					.getOne())!.offers,
				logger
			)
		);
	}

	if (!filters.type || filters.type === "spend") {
		offers = offers.concat(
			await filterOffers(
				userId,
				(await query
					.andWhere("offer.type = :type", { type: "spend" })
					.orderBy("offer.amount", "ASC")
					.addOrderBy("offer.id", "ASC")
					.getOne())!.offers,
				logger
			)
		);
	}

	metrics.offersReturned(offers.length);
	return { offers, paging: { cursors: {} } };
}
