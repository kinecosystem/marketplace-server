import { Request as ExpressRequest } from "express-serve-static-core";
import * as httpContext from "express-http-context";

import * as metrics from "../../metrics";
import * as db from "../../models/offers";
import { ModelFilters } from "../../models";
import * as dbOrders from "../../models/orders";
import { Paging } from "./index";
import * as offerContents from "./offer_contents";
import { Application, AppOffer } from "../../models/applications";
import { ContentType, OfferContent, OfferType } from "../../models/offers";
import { Order } from "../../models/orders";
import { OfferTranslation } from "../../models/translations";
import { NoSuchApp } from "../../errors";

import * as semver from "semver";
import { CLIENT_SDK_VERSION_HEADER } from "../../middleware";

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

type VersionRule = {
	comparator: string;
	data: VersionRuleData;
};

type VersionRuleData = {
	[defaultKey: string]: string
};

const IMAGE_VERSION_RULES: VersionRule[] = [
	/*
		These rules are evaluated in order, so order takes precedence. First rule to
		be satisfied by the client version will apply.
		Example:
		Consider this list of comparators [">=1.0.0", "=5.0.0"]
		given a client version 5.0.0 the ">=1.0.0" rule will apply although "=5.0.0" is more exact.
	*/
	{
		comparator: ">=1.0.0",
		data: {
			"https://cdn.kinecosystem.com/thumbnails/offers/earn-cover-images-v2/tell_us_more.png": "https://cdn.kinecosystem.com/thumbnails/offers/222x222/1_poll.png",
			"https://cdn.kinecosystem.com/thumbnails/offers/earn-cover-images-v2/favorites.png": "https://cdn.kinecosystem.com/thumbnails/offers/222x222/2_poll.png",
			"https://cdn.kinecosystem.com/thumbnails/offers/earn-cover-images-v2/take_a_survaey.png": "https://cdn.kinecosystem.com/thumbnails/offers/222x222/3_poll.png",
			"https://cdn.kinecosystem.com/thumbnails/offers/earn-cover-images-v2/do_you_like.png": "https://cdn.kinecosystem.com/thumbnails/offers/222x222/4_poll.png",
			"https://cdn.kinecosystem.com/thumbnails/offers/earn-cover-images-v2/sport.png": "https://cdn.kinecosystem.com/thumbnails/offers/222x222/4_poll.png",
			"https://cdn.kinecosystem.com/thumbnails/offers/earn-cover-images-v2/movies.png": "https://cdn.kinecosystem.com/thumbnails/offers/222x222/5_poll.png",
			"https://cdn.kinecosystem.com/thumbnails/offers/earn-cover-images-v2/answer_poll.png": "https://cdn.kinecosystem.com/thumbnails/offers/222x222/6_poll.png",
			"https://cdn.kinecosystem.com/thumbnails/offers/quiz_5.png": "https://cdn.kinecosystem.com/thumbnails/offers/222x222/1_quiz.png",
			"https://cdn.kinecosystem.com/thumbnails/offers/quiz_2.png": "https://cdn.kinecosystem.com/thumbnails/offers/222x222/2_quiz.png",
			"https://cdn.kinecosystem.com/thumbnails/offers/quiz_4.png": "https://cdn.kinecosystem.com/thumbnails/offers/222x222/3_quiz.png",
			"https://cdn.kinecosystem.com/thumbnails/offers/quiz_1.png": "https://cdn.kinecosystem.com/thumbnails/offers/222x222/4_quiz.png",
			"https://cdn.kinecosystem.com/thumbnails/offers/quiz_3.png": "https://cdn.kinecosystem.com/thumbnails/offers/222x222/5_quiz.png",
		}
	}
];

function getVersionImageData(version: string): VersionRuleData {
	const selectedRule = IMAGE_VERSION_RULES.find(rule => semver.satisfies(version, rule.comparator)) || { data: {} };
	return selectedRule.data;
}

function getImageDataResolver(version: string) {
	const versionImageData = getVersionImageData(version);
	return (key: string, defaultValue: string = key) => {
		return versionImageData[key] || defaultValue;
	};
}

function offerDbToApi(offer: db.Offer, content: db.OfferContent, offerTranslations: OfferTranslations, walletAddress: string) {
	const imageDataResolver = getImageDataResolver(httpContext.get(CLIENT_SDK_VERSION_HEADER));
	const offerData = {
		id: offer.id,
		title: offerTranslations.title || offer.meta.title,
		description: offerTranslations.description || offer.meta.description,
		image: imageDataResolver(offer.meta.image),
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
	if (!appOffers) { // special case as most partners don't have spend offers
		return [];
	}
	const [/*totalOfferCounts*/, userOfferCounts, contents, [language, availableTranslations]] = await Promise.all([
		/*Order.countAllByOffer(appId)*/,
		Order.countAllByOffer(appId, { userId }),
		OfferContent.all(),
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
	const app = await Application.get(appId);
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
