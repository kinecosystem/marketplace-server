import { getConfig } from "../config";
import { Paging, ServiceResult } from "./index";
import { Order } from "./orders";

export interface PollAnswer {
	content_type: "HTMLPollAnswer";
	answers: { [key: string]: string };
}

export interface Offer {
	id: string;
	title: string;
	description: string;
	image: string;
	amount: number;
	content: string;
	content_type: "coupon" | "poll";
	offer_type: "earn" | "spend";
}

export interface OfferList {
	offers: Offer[];
	paging: Paging;
}

export async function getOffers(options): Promise<OfferList> {
	const earn = [
		"earn_offer1.png",
		"earn_offer2.png",
		"earn_offer3.png",
		"earn_offer4.png",
		"earn_offer5.png",
	];
	const spend = [
		"spend_offer1.png",
		"spend_offer2.png",
		"spend_offer3.png",
		"spend_offer4.png",
		"spend_offer5.png",
	];

	const assetsBase = getConfig().assets_base;
	const offers = earn.map<Offer>(img => ({
		amount: 4000,
		content: "<html><body><h1>title</h1><div>my poll</div></body></html>",
		content_type: "poll",
		description: "Tell us about yourself",
		id: img,
		image: assetsBase + img,
		offer_type: "earn",
		title: "Answer a poll",
	})).concat(spend.map<Offer>(img => ({
		amount: 8000,
		content_type: "coupon",
		content: "aaa-bbb-ccc-ddd",
		description: "$10 gift card",
		id: img,
		image: assetsBase + img,
		offer_type: "spend",
		title: "Gift Card",
	})));

	return { offers, paging: { cursors: {} } };
}
