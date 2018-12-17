import { getDefaultLogger as log } from "../../logging";
import { Request as ExpressRequest } from "express-serve-static-core";

import * as metrics from "../../metrics";
import * as db from "../../models/offers";
import { ModelFilters } from "../../models";
import * as dbOrders from "../../models/orders";
import { Paging } from "./index";
import * as offerContents from "./offer_contents";
import { Application, AppOffer } from "../../models/applications";
import { ContentType, OfferType } from "../../models/offers";
import { getConfig } from "../config";
import { Order } from "../../models/orders";
import { OfferTranslation } from "../../models/translations";
import { NoSuchApp } from "../../errors";

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

function offerDbToApi(offer: db.Offer, content: db.OfferContent, offerTranslations: OfferTranslations, walletAddress: string) {
	const offerData = {
		id: offer.id,
		title: offerTranslations.title || offer.meta.title,
		description: offerTranslations.description || offer.meta.description,
		image: offer.meta.image,
		amount: offer.amount,
		blockchain_data: offer.type === "spend" ? { recipient_address: walletAddress } : { sender_address: walletAddress },
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

async function getLanguage(acceptsLanguagesFunc?: ExpressRequest["acceptsLanguages"]): Promise<[string | false, OfferTranslation[]]> {
	if (acceptsLanguagesFunc) {
		const [availableLanguages, availableTranslations] = await OfferTranslation.getSupportedLanguages({ languages: acceptsLanguagesFunc() });
		const language = acceptsLanguagesFunc(availableLanguages); // get the most suitable language for the client
		return [language, availableTranslations];
	}
	return [false, []];
}

/**
 * return the sublist of offers from this app that the user can complete due to capping
 */
async function filterOffers(userId: string, appId: string, appOffers: AppOffer[], acceptsLanguagesFunc?: ExpressRequest["acceptsLanguages"]): Promise<Offer[]> {
	if (!appOffers) { // special case as most partners don't hanve spend offers
		return [];
	}
	const [/*totalOfferCounts*/, userOfferCounts, contents, [language, availableTranslations]] = await Promise.all([
		/*Order.countAllByOffer(appId)*/,
		Order.countAllByOffer(appId, { userId }),
		offerContents.getAllContents(),
		getLanguage(acceptsLanguagesFunc)
	]);

	return (await Promise.all(
		appOffers
			.map(async appOffer => {
				const offer = appOffer.offer;
				// if ((totalOfferCounts.get(offer.id) || 0) >= appOffer.cap.total) {
				// 	return null;
				// }
				if ((userOfferCounts.get(offer.id) || 0) >= appOffer.cap.per_user) {
					return null;
				}
				const content = contents.get(offer.id);
				if (!content) {
					return null;
				}
				return offerDbToApi(
					offer,
					content,
					getOfferTranslations(language, offer.id, availableTranslations),
					appOffer.walletAddress);
			})
	)).filter(offer => offer !== null) as Offer[];
}

export async function getOffers(userId: string, appId: string, filters: ModelFilters<db.Offer>, acceptsLanguagesFunc?: ExpressRequest["acceptsLanguages"]): Promise<OfferList> {
	const app = await Application.findOneById(appId);
	if (!app) {
		throw NoSuchApp(appId);
	}

	async function getEarn() {
		if (!filters.type || filters.type === "earn") {
			const offers = await filterOffers(
				userId,
				appId,
				await AppOffer.getAppOffers(appId, "earn"),
				acceptsLanguagesFunc
			);
			const daily_earn_offers = app!.config.daily_earn_offers;
			const completedToday = await dbOrders.Order.countToday(userId, "earn", "marketplace");
			return offers.slice(0, Math.max(0, daily_earn_offers - completedToday));
		}
		return [];
	}

	async function getSpend() {
		if (!filters.type || filters.type === "spend") {
			return await filterOffers(
				userId,
				appId,
				await AppOffer.getAppOffers(appId, "spend"),
				acceptsLanguagesFunc
			);
		}
		return [];
	}

	const offers: Offer[] = ([] as Offer[]).concat(...(await Promise.all([getEarn(), getSpend()])));
	metrics.offersReturned(offers.length, appId);
	return { offers, paging: { cursors: {} } };
}
