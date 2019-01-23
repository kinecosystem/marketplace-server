import { getDefaultLogger as logger } from "../../logging";
import { isNothing } from "../../utils/utils";
import { localCache } from "../../utils/cache";
import * as db from "../../models/offers";
import { InvalidPollAnswers, NoSuchOffer } from "../../errors";
import * as dbOrder from "../../models/orders";

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
	return template
		.replace(/\${amount}/g, args.amount.toLocaleString("en-US"))
		.replace(/\${amount.raw}/g, args.amount.toString());
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

// check the order answers and return the new amount for the order
export async function submitFormAndMutateMarketplaceOrder(order: dbOrder.MarketplaceOrder, form: string | undefined) {
	const offer = await db.Offer.findOneById(order.offerId);
	if (!offer) {
		throw NoSuchOffer(order.offerId);
	}

	if (offer.type === "earn") {
		const offerContent = (await getOfferContent(order.offerId))!;

		switch (offerContent.contentType) {
			case "poll":
				// validate form
				if (!isValid(offerContent, form)) {
					throw InvalidPollAnswers();
				}
				await savePollAnswers(order.user.id, order.offerId, order.id, form); // TODO should we also save quiz results?
				break;
			case "quiz":
				order.amount = await sumCorrectQuizAnswers(offerContent, form) || 1; // TODO remove || 1 - don't reward wrong answers
				// should we replace order.meta.content
				break;
			case "tutorial":
				// nothing
				break;
			default:
				logger().warn(`unexpected content type ${ offerContent.contentType }`);
		}
	}
}

function isValid(offerContent: db.OfferContent, form: string | undefined): form is string {
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

async function sumCorrectQuizAnswers(offerContent: db.OfferContent, form: string | undefined): Promise<number> {
	if (isNothing(form)) {
		return 0;
	}

	let answers: Answers;
	try {
		answers = JSON.parse(form);
	} catch (e) {
		return 0;
	}

	const quiz: Quiz = JSON.parse(offerContent.content);  // this might fail if not valid json without replaceTemplateVars

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

async function savePollAnswers(userId: string, offerId: string, orderId: string, content: string): Promise<void> {
	const answers = db.PollAnswer.new({
		userId, offerId, orderId, content
	});

	await answers.save();
}
