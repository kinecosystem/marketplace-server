import { LoggerInstance } from "winston";

import * as metrics from "../../metrics";
import * as db from "../../models/offers";
import { ModelFilters } from "../../models";
import * as dbOrders from "../../models/orders";
import { Paging } from "./index";
import * as offerContents from "./offer_contents";
import { Application } from "../../models/applications";
import { ContentType, OfferType } from "../../models/offers";
import { getConfig } from "../config";
import { Order } from "../../models/orders";
import { OfferTranslation } from "../../models/translations";
import { normalizeLanguageString } from "../../admin/translations";

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

type OfferTranslations = {
	title: string;
	description: string;
	orderTitle: string;
	orderDescription: string;
	content: any;
};

function offerDbToApi(offer: db.Offer, content: db.OfferContent, offerTranslations: OfferTranslations) {
	const offerData = {
		id: offer.id,
		title: offerTranslations.title || offer.meta.title,
		description: offerTranslations.description || offer.meta.description,
		image: offer.meta.image,
		amount: offer.amount,
		blockchain_data: offer.blockchainData,
		offer_type: offer.type,
		content: offerTranslations.content || content.content,
		content_type: content.contentType,
	};
	offerData.content = offerContents.replaceTemplateVars(offer, offerData.content);
	return offerData;
}

function getOfferTranslations(language: string | null, offerId: string, availableTranslations: OfferTranslation[]) {
	if (!language) {
		return {} as OfferTranslations;
	}
	return availableTranslations.reduce((offerTranslations, translation) => {
		if (translation.language === language && translation.offerId === offerId) {
			offerTranslations[translation.path as keyof OfferTranslations] = translation.translation;
		}
		return offerTranslations;
	}, {} as OfferTranslations);
}

/**
 * return the sublist of offers from this app that the user can complete
 */
async function filterOffers(userId: string, app: Application | undefined, logger: LoggerInstance, acceptsLanguagesFunc?: any): Promise<Offer[]> {
	// TODO: this should be a temp fix!
	// the app should not be undefined as we used left join, figure it out
	if (!app || !app.offers.length) {
		return [];
	}
	const offerCounts = await Order.countAllByOffer(userId);
	const contents = await offerContents.getAllContents();
	let availableTranslations: OfferTranslation[] = [];
	let language: string | null = null;
	if (acceptsLanguagesFunc) {
		availableTranslations = await OfferTranslation.createQueryBuilder("translations")
			.where("translations.language IN (:languages)", { languages: acceptsLanguagesFunc() })
			.getMany();
		const availableLanguages = new Set(availableTranslations.map(translation => translation.language));
		// The acceptsLanguagesFunc returns an array of all client accepted languages if no params are passed. If an array of languages is passed the when most suitable for the client will be returned.
		language = acceptsLanguagesFunc(Array.from(availableLanguages)); // get the most suitable language for the client
	}
	return (await Promise.all(
		app.offers
			.map(async offer => {
					if ((offerCounts.get(offer.id) || 0) >= offer.cap.per_user) {
						return null;
					}
					const content = contents.get(offer.id);
					if (!content) {
						return null;
					}
					return offerDbToApi(offer, content, getOfferTranslations(language, offer.id, availableTranslations));
				}
			)
	)).filter(offer => offer !== null) as Offer[];
}

export async function getOffers(userId: string, appId: string, filters: ModelFilters<db.Offer>, logger: LoggerInstance, acceptsLanguagesFunc?: any): Promise<OfferList> {
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
				logger,
				acceptsLanguagesFunc
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
				logger,
				acceptsLanguagesFunc
			)
		);
	}

	metrics.offersReturned(offers.length, appId);
	return { offers, paging: { cursors: {} } };
}
