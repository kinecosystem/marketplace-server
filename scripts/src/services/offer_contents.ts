import { LoggerInstance } from "winston";

import * as db from "../models/offers";

export interface Question {
	id: string;
	answers: string[];
}

export enum PageType {
	"FullPageMultiChoice",
	"ImageAndText",
}

export interface Poll {
	pages: Array<{ type: PageType, title: string, description: string, question: Question }>;
}

export interface Tutorial {
	pages: Array<{ type: PageType.ImageAndText, title: string, image: string, bodyHtml: string, footerHtml: string, buttonText: string }>;
}

export type Answers = { [key: string]: string };

export const kikPoll: Poll = {
	pages: [{
		type: PageType.FullPageMultiChoice,
		title: "Who do you primarily chat with on Kik?",
		description: `Complete the poll to earn <span style='color:#047cfc;'>4,000</span> Kin`,
		question: {
			id: "favourite_color",
			answers: [
				"New friends I've met on Kik",
				"Friends I've met elsewhere online",
				"Friends I know from real life",
				"An equal mix of all three!",
			],
		},
	}],
};

export const animalPoll: Poll = {
	pages: [{
		type: PageType.FullPageMultiChoice,
		title: "Whats your favourite animal?",
		description: "Who doesn't love animals!?",
		question: {
			id: "favourite_animal",
			answers: ["dog", "cat", "monkey", "mouse"],
		},
	}],
};

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

export const tutorial: Tutorial = {
	pages: [
		{
			type: PageType.ImageAndText,
			image: "https://s3.amazonaws.com/htmlpoll.kinecosystem.com/kinlogoTut%403x.png",
			title: "What is Kin?",
			bodyHtml: "Kin is a new currency for use in everyday digital services. In our Marketplace you\’ll be able to earn Kin by completing tasks and spend Kin on top brands",
			footerHtml: "Complete the tutorial and earn <span style='color:#047cfc;'>6,000</span> Kin",
			buttonText: "Next",
		},
		{
			type: PageType.ImageAndText,
			image: "https://s3.amazonaws.com/htmlpoll.kinecosystem.com/kinMarketplaceIcon%403x.png",
			title: "Kin Marketplace",
			bodyHtml: "The Kin Marketplace experience provides you with a core wallet functionally which includes a place to view your balance as well as incoming/outgoing payments. The Marketplace is a home base where you can engage in the earn/spend opportunities.",
			footerHtml: "Complete the tutorial and earn <span style='color:#047cfc;'>6,000</span> Kin",
			buttonText: "Next",
		},
		{
			type: PageType.ImageAndText,
			image: "https://s3.amazonaws.com/htmlpoll.kinecosystem.com/walletsIcon%403x.png",
			title: "How to earn/spend Kin?",
			bodyHtml: "You can earn Kin by investing a little time to complete tasks such as answering short surveys, watching a video or reading a tutorial just like this one.",
			footerHtml: "Complete the tutorial and earn <span style='color:#047cfc;'>6,000</span> Kin",
			buttonText: "Got It",
		},
	],
};

export async function getOffer(offerId: string, logger: LoggerInstance): Promise<db.OfferContent> {
	return await db.OfferContent.findOne({ offerId });
}

export async function isValid(offerId: string, form: string, logger: LoggerInstance): Promise<boolean> {
	// let parsed: Answers;
	// try {
	// 	parsed = JSON.parse(form);
	// } catch (error) {
	// 	logger.error(`failed parsing content <${form}> for offer ${offerId}`);
	// 	throw Error(`failed parsing content <${form}> for offer ${offerId}`);
	// }
	//
	// const offer = await getOffer(offerId, logger);
	// const poll: Poll = JSON.parse(offer.content);
	// // go over poll data, look for questions and check that answer is within question options
	// for (const page of poll.pages) {
	// 	const qId = page.question.id;
	// 	const ans = page.question.answers;
	//
	// 	if (!ans.includes(parsed[qId])) {
	// 		return false;
	// 	}
	// }
	return true;
}
