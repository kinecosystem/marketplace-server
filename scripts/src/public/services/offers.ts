import { LoggerInstance } from "winston";
import { Request as ExpressRequest } from "express-serve-static-core";

import * as metrics from "../../metrics";
import * as db from "../../models/offers";
import { ModelFilters } from "../../models";
import * as dbOrders from "../../models/orders";
import { Paging } from "./index";
import * as offerContents from "./offer_contents";
import { AppOffer } from "../../models/applications";
import { ContentType, OfferType } from "../../models/offers";
import { getConfig } from "../config";
import { Order } from "../../models/orders";
import { OfferTranslation } from "../../models/translations";

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

function getOfferTranslations(language: string | false, offerId: string, availableTranslations: OfferTranslation[]) {
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
 * return the sublist of offers from this app that the user can complete due to capping
 */
async function filterOffers(userId: string, appOffers: AppOffer[], logger: LoggerInstance, acceptsLanguagesFunc?: ExpressRequest["acceptsLanguages"]): Promise<Offer[]> {
	const totalOfferCounts = await Order.countAllByOffer();
	const userOfferCounts = await Order.countAllByOffer(userId);
	const contents = await offerContents.getAllContents();
	let availableTranslations: OfferTranslation[] = [];
	let language: string | false = false;
	if (acceptsLanguagesFunc) {
		let availableLanguages;
		[availableLanguages, availableTranslations] = await OfferTranslation.getSupportedLanguages({ languages: acceptsLanguagesFunc() });
		language = acceptsLanguagesFunc(availableLanguages); // get the most suitable language for the client
	}
	return (await Promise.all(
		appOffers
			.map(async appOffer => {
				const offer = appOffer.offer;
				if ((totalOfferCounts.get(offer.id) || 0) >= offer.cap.total) {
					return null;
				}
				if ((userOfferCounts.get(offer.id) || 0) >= offer.cap.per_user) {
					return null;
				}
				const content = contents.get(offer.id);
				if (!content) {
					return null;
				}
				return offerDbToApi(offer, content, getOfferTranslations(language, offer.id, availableTranslations));
			})
	)).filter(offer => offer !== null) as Offer[];
}

export async function getOffers(userId: string, appId: string, filters: ModelFilters<db.Offer>, logger: LoggerInstance, acceptsLanguagesFunc?: ExpressRequest["acceptsLanguages"]): Promise<OfferList> {
	let offers = [] as Offer[];

	if (!filters.type || filters.type === "earn") {
		offers = offers.concat(
			await filterOffers(
				userId,
				await AppOffer.getAppOffers(appId, "earn"),
				logger,
				acceptsLanguagesFunc
			)
		);
		// TODO we might want to add a rate limit/ daily cap globally per app
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
				await AppOffer.getAppOffers(appId, "spend"),
				logger,
				acceptsLanguagesFunc
			)
		);
	}

	metrics.offersReturned(offers.length, appId);
	return { offers, paging: { cursors: {} } };
}
