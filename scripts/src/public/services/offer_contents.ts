import { LoggerInstance } from "winston";

import { isNothing } from "../../utils";
import * as db from "../../models/offers";

export interface Question {
	id: string;
	answers: string[];
}

export enum PageType {
	"FullPageMultiChoice",
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

export interface EarnThankYouPage {
	type: PageType.EarnThankYou;
	description: string;
}

export interface Poll {
	pages: Array<PollPage | EarnThankYouPage>;
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

export async function getOffer(offerId: string, logger: LoggerInstance): Promise<db.OfferContent | undefined> {
	return await db.OfferContent.findOne({ offerId });
}

export function isValid(offerId: string, form: string | undefined): form is string {
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

export async function savePollAnswers(userId: string, offerId: string, orderId: string, content: string): Promise<void> {
	const answers = db.PollAnswer.new({
		userId, offerId, orderId, content
	});

	await answers.save();
}
