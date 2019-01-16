import { getDefaultLogger as log } from "../../logging";
import { Request as ExpressRequest } from "express-serve-static-core";

import { isNothing } from "../../utils/utils";
import { localCache } from "../../utils/cache";
import * as db from "../../models/offers";
import { OfferTranslation } from "../../models/translations";

export interface Question {
	id: string;
	answers: string[];
}

export enum PageType {
	"FullPageMultiChoice",
	"ImageAndText",
	"EarnThankYou",
	"TimedFullPageMultiChoice",
	"SuccessBasedThankYou",
}

export interface PollPage {
	type: PageType;
	title: string;
	description: string;
	question: Question;
}

export interface QuizPage {
	type: PageType;
	description: string;
	amount: number;
	rightAnswer: number; // XXX change answers to have an id
	question: Question;
}

export interface EarnThankYouPage {
	type: PageType.EarnThankYou;
	description: string;
}

export interface SuccessBasedThankYouPage {
	type: PageType.SuccessBasedThankYou;
	description: string;
}

export interface Poll {
	pages: Array<PollPage | EarnThankYouPage>;
}

export interface Quiz {
	pages: Array<QuizPage | SuccessBasedThankYouPage>;
}

export type TutorialPage = {
	type: PageType.ImageAndText,
	title: string,
	image: string,
	bodyHtml: string,
	footerHtml: string,
	buttonText: string
};

export interface Tutorial {
	pages: Array<TutorialPage | EarnThankYouPage>;
}

export const TUTORIAL_DESCRIPTION = "Kin Tutorial";

export type Answers = { [key: string]: number };
export type AnswersBackwardSupport = { [key: string]: string };

export interface CouponInfo {
	title: string;
	description: string;
	amount: number;
	image: string;
	confirmation: {
		title: string;
		description: string;
		image: string;
	};
}

export interface CouponOrderContent {
	title: string;
	description: string;
	link: string;
	image: string;
}

/**
 * replace template variables in offer content or order contents
 */
export function replaceTemplateVars(args: { amount: number }, template: string) {
	// XXX currently replace here instead of client
	const rendered = template
		.replace(/\${amount}/g, args.amount.toLocaleString("en-US"))
		.replace(/\${amount.raw}/g, args.amount.toString());
	JSON.parse(rendered); // throws if not valid json
	return rendered;
}

export async function getOfferContent(offerId: string): Promise<db.OfferContent | undefined> {
	return await db.OfferContent.findOne({ offerId });
}

export async function getAllContents(): Promise<Map<string, db.OfferContent>> {
	const cacheKey = "offerContents";
	let contentsMap = localCache.get<Map<string, db.OfferContent>>(cacheKey);
	if (!contentsMap) {
		contentsMap = new Map<string, db.OfferContent>();
		for (const res of await db.OfferContent.find()) {
			contentsMap.set(res.offerId, res);
		}
		localCache.set(cacheKey, contentsMap);
	}

	return contentsMap;
}

export function isValid(offerContent: db.OfferContent, form: string | undefined): form is string {
	if (isNothing(form)) {
		return false;
	}

	let answers: Answers;
	try {
		answers = JSON.parse(form);
	} catch (e) {
		return false;
	}

	return typeof answers === "object" && !Array.isArray(answers);
}

export async function sumCorrectQuizAnswers(offerContent: db.OfferContent, form: string | undefined, acceptsLanguagesFunc?: ExpressRequest["acceptsLanguages"]): Promise<number> {
	if (isNothing(form)) {
		return 0;
	}

	let answers: Answers;
	try {
		answers = JSON.parse(form);
	} catch (e) {
		return 0;
	}

	// backward support check - when answer values are string, use the old sum function
	if (typeof Object.values(answers)[0] === "string") {
		return sumCorrectQuizAnswersBackwardSupport(offerContent, form, acceptsLanguagesFunc);
	}

	const translatedContent = await getTranslatedQuizContent(offerContent, acceptsLanguagesFunc);

	const quiz: Quiz = JSON.parse(translatedContent || offerContent.content);  // this might fail if not valid json without replaceTemplateVars

	function sumQuizRightAnswersAmount(sum: number, page: QuizPage | SuccessBasedThankYouPage) {
		if (page.type === PageType.TimedFullPageMultiChoice) {
			if (answers[page.question.id] === page.rightAnswer) {
				return sum + page.amount;
			}
		}
		return sum;
	}

	return quiz.pages.reduce(sumQuizRightAnswersAmount, 0);
}

async function getTranslatedQuizContent(offerContent: db.OfferContent, acceptsLanguagesFunc: ExpressRequest["acceptsLanguages"] | undefined) {
	if (!(acceptsLanguagesFunc && acceptsLanguagesFunc().length)) {
		return null;
	}

	const [supportedLanguages, availableTranslations] = await OfferTranslation.getSupportedLanguages({
		paths: ["content"],
		offerId: offerContent.offerId,
		languages: acceptsLanguagesFunc(),
	});
	const language = acceptsLanguagesFunc(supportedLanguages);
	const translations = availableTranslations.filter(translation => translation.language === language);
	return translations.length ? translations[0].translation : null;
}

export async function savePollAnswers(userId: string, offerId: string, orderId: string, content: string): Promise<void> {
	const answers = db.PollAnswer.new({
		userId, offerId, orderId, content
	});

	await answers.save();
}

export async function sumCorrectQuizAnswersBackwardSupport(offerContent: db.OfferContent, form: string | undefined, acceptsLanguagesFunc?: ExpressRequest["acceptsLanguages"]): Promise<number> {
	if (isNothing(form)) {
		return 0;
	}

	let answers: AnswersBackwardSupport;

	try {
		answers = JSON.parse(form);
	} catch (e) {
		return 0;
	}
	let translatedContent;
	if (acceptsLanguagesFunc && acceptsLanguagesFunc().length) {
		const [supportedLanguages, availableTranslations] = await OfferTranslation.getSupportedLanguages({
			paths: ["content"],
			offerId: offerContent.offerId,
			languages: acceptsLanguagesFunc(),
		});
		const language = acceptsLanguagesFunc(supportedLanguages);
		const translations = availableTranslations.filter(translation => translation.language === language);
		translatedContent = translations.length ? translations[0].translation : null;
	}

	const quiz: Quiz = JSON.parse(translatedContent || offerContent.content);  // this might fail if not valid json without replaceTemplateVars
	let amountSum = 0;

	for (const page of quiz.pages) {
		if (page.type === PageType.TimedFullPageMultiChoice) {
			const p = (page as QuizPage);
			const answerIndex = p.question.answers.indexOf(answers[p.question.id]) + 1;
			if (answerIndex === p.rightAnswer) {
				amountSum += p.amount;
			}
		}
	}
	return amountSum;
}
