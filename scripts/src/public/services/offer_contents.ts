import { LoggerInstance } from "winston";

import { isNothing } from "../../utils";
import * as db from "../../models/offers";

export interface Question {
	id: string;
	answers: string[];
}

export enum PageType {
	"FullPageMultiChoice",
	"TimedFullPageMultiChoice",
	"ImageAndText",
	"EarnThankYou",
}

export interface BaseEarnPage {
	type: PageType;
	title: string;
}

export interface PollPage extends BaseEarnPage {
	description: string;
	question: Question;
}

export interface QuizPage extends PollPage {
	amount: number;
	rightAnswer: number; // XXX change answers to have an id
}

export interface EarnThankYouPage {
	type: PageType.EarnThankYou;
	description: string;
}

export interface Poll {
	pages: Array<PollPage | EarnThankYouPage>;
}

export interface Quiz {
	pages: Array<QuizPage | EarnThankYouPage>;
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

export type Answers = { [key: string]: string };

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

export async function getOfferContent(offerId: string, logger: LoggerInstance): Promise<db.OfferContent | undefined> {
	return await db.OfferContent.findOne({ offerId });
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

export function sumCorrectQuizAnswers(offerContent: db.OfferContent, form: string | undefined): number {
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

export async function savePollAnswers(userId: string, offerId: string, orderId: string, content: string): Promise<void> {
	const answers = db.PollAnswer.new({
		userId, offerId, orderId, content
	});

	await answers.save();
}
