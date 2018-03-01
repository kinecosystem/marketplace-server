import * as db from "../models/offers";
import { getLogger } from "../logging";

const logger = getLogger();

export interface Question {
	id: string;
	answers: string[];
}

export interface Poll {
	pages: Array<{ title: string, description: string, question: Question }>;
}

export type Answers = { [key: string]: string };

export const kikPoll: Poll = {
	pages: [{
		title: "Who do you primarily chat with on Kik?",
		description: `Finish the poll to earn <span style='color:#047cfc;'>4,000</span> Kin`,
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
		title: "Whats your favourite animal?",
		description: "Who doesn't love animals!?",
		question: {
			id: "favourite_animal",
			answers: ["dog", "cat", "monkey", "mouse"],
		},
	}],
};

export async function getOffer(offerId: string): Promise<db.OfferContent> {
	return await db.OfferContent.findOne({ offerId });
}

export async function isValid(offerId: string, form: string): Promise<boolean> {
	let parsed: Answers;
	try {
		parsed = JSON.parse(form);
	} catch (error) {
		logger.error(`failed parsing content <${form}> for offer ${offerId}`);
		throw Error(`failed parsing content <${form}> for offer ${offerId}`);
	}

	const offer = await getOffer(offerId);
	const poll: Poll = JSON.parse(offer.content);
	// go over poll data, look for questions and check that answer is within question options
	for (const page of poll.pages) {
		const qId = page.question.id;
		const ans = page.question.answers;

		if (!ans.includes(parsed[qId])) {
			return false;
		}
	}
	return true;
}
