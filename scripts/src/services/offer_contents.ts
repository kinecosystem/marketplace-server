import * as db from "../models/offers";

export interface Question {
	id: string;
	answers: string[];
}

export interface Poll {
	pages: Array<{ title: string, question: Question }>;
}

export type Answers = { [key: string]: string };

export const poll1: Poll = {
	pages: [{
		title: "What color do you like?",
		question: {
			id: "favourite_color",
			answers: ["red", "green", "blue"],
		},
	}],
};

export const poll2: Poll = {
	pages: [{
		title: "Whats your favourite animal?",
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
	const parsed: Answers = JSON.parse(form);

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
