import * as db from "../models/offers";

export interface Question {
	id: string;
	answers: string[];
}

export interface Poll {
	pages: any;
}

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
	const parsed = JSON.parse(form);

	const offer: db.OfferContent = await getOffer(offerId);
	const poll: Poll = JSON.parse(offer.content);

	for (const page of poll.pages) {
		const qId: string = page.question.id;
		const ans: string[] = page.question.answers;

		if (ans.includes(parsed[qId])) {
			return false;
		}
	}
	return true;
}
