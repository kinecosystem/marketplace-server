import { LoggerInstance } from "winston";

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
}

export interface Poll {
	pages: Array<PollPage | EarnThankYouPage>;
}

export type TutorialPage = {
	type: PageType.ImageAndText,
	title: string, image: string,
	bodyHtml: string, footerHtml: string, buttonText: string
};

export interface Tutorial {
	pages: Array<TutorialPage | EarnThankYouPage>;
}

export const TUTORIAL_DESCRIPTION = "Kin Tutorial";

export type Answers = { [key: string]: string };

export const kikPoll: Poll = {
	pages: [{
		type: PageType.FullPageMultiChoice,
		title: "Who do you primarily chat with on Kik?",
		description: `Complete the poll to earn <span style='color:#047cfc;'>4,000</span> Kin`,
		question: {
			id: "who34",
			answers: [
				"New friends I've met on Kik",
				"Friends I've met elsewhere online",
				"Friends I know from real life",
				"An equal mix of all three!",
			],
		},
	}, {
		type: PageType.FullPageMultiChoice,
		title: "What do you like to use the most when chatting with others on Kik?",
		description: `Complete the poll to earn <span style='color:#047cfc;'>4,000</span> Kin`,
		question: {
			id: "what324",
			answers: [
				"Video chat", "Stickers", "Gifs", "Emojis", "Kik custom emojis", "Just regular text messages",
			],
		},
	}, {
		type: PageType.FullPageMultiChoice,
		title: "If you could improve one thing about Kik, what would you improve?",
		description: `Complete the poll to earn <span style='color:#047cfc;'>4,000</span> Kin`,
		question: {
			id: "how3245",
			answers: [
				"Video Chat", "Public Groups", "Privacy Settings", "Speed/Reliability",
			],
		},
	}, {
		type: PageType.FullPageMultiChoice,
		title: "What's your favorite thing to do on Kik?",
		description: `Complete the poll to earn <span style='color:#047cfc;'>4,000</span> Kin`,
		question: {
			id: "favourite_thing345",
			answers: [
				"Chatting 1:1 with friends", "Using chat bots", "Chatting 1:1 with new people", "Group Chats",
			],
		},
	}, {
		type: PageType.FullPageMultiChoice,
		title: "How did you first hear about Kik?",
		description: `Complete the poll to earn <span style='color:#047cfc;'>4,000</span> Kin`,
		question: {
			id: "how432565",
			answers: [
				"Friends/Family", "Social Media", "Website/Search Engine", "Ads",
			],
		},
	}, {
		type: PageType.EarnThankYou,
	},
	],
};

export const kinPoll: Poll = {
	pages: [{
		type: PageType.FullPageMultiChoice,
		title: "How would you rate the Kin Marketplace experience so far?",
		description: `Complete the poll to earn <span style='color:#047cfc;'>4,000</span> Kin`,
		question: {
			id: "who34",
			answers: [
				"I'm loving it!", "OK", "I'm not sure", "I won't come back",
			],
		},
	}, {
		type: PageType.FullPageMultiChoice,
		title: "How would you describe the Spend offers in the Marketplace?",
		description: `Complete the poll to earn <span style='color:#047cfc;'>4,000</span> Kin`,
		question: {
			id: "what324",
			answers: [
				"Excellent", "Good", "OK", "Not for me",
			],
		},
	}, {
		type: PageType.FullPageMultiChoice,
		title: "What type of gift card would you chose to spend your Kin on?",
		description: `Complete the poll to earn <span style='color:#047cfc;'>4,000</span> Kin`,
		question: {
			id: "how3245",
			answers: [
				"Amazon", "Movie ticket", "Fast food", "Beauty", "Music", "Other", "I want to keep my Kin",
			],
		},
	}, {
		type: PageType.FullPageMultiChoice,
		title: "Would you recommend the Kin marketplace experience to a friend?",
		description: `Complete the poll to earn <span style='color:#047cfc;'>4,000</span> Kin`,
		question: {
			id: "favourite_thing345",
			answers: [
				"For sure!", "I probably will", "I'm not sure", "I don't think so...",
			],
		},
	}, {
		type: PageType.FullPageMultiChoice,
		title: "What is your favourite part of the Kin Marketplace experience?",
		description: `Complete the poll to earn <span style='color:#047cfc;'>4,000</span> Kin`,
		question: {
			id: "how432565",
			answers: [
				"Completing Polls", "Getting Kin", "Browsing Gift Cards", "Spending Kin",
			],
		},
	},
		{
			type: PageType.EarnThankYou,
		},
	],
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
		{
			type: PageType.EarnThankYou,
		},

	],
};

export async function getOffer(offerId: string, logger: LoggerInstance): Promise<db.OfferContent | undefined> {
	return await db.OfferContent.findOne({ offerId });
}

export async function isValid(offerId: string, form: string | undefined, logger: LoggerInstance): Promise<boolean> {
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
	return form !== undefined;
}
