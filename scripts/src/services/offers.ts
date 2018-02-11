import { getConfig } from "../config";
import { ServiceResult } from "./index";
import { Order } from "./orders";

export interface Coupon {
	description: string;
	content_type: "Coupon";
}

export interface HTMLPoll {
	content_type: "HTMLPoll";
	html: string;
}

export interface HTMLPollAnswer {
	content_type: "HTMLPollAnswer";
	answers: { [key: string]: string };
}

export interface Offer {
	id: string;
	title: string;
	description: string;
	image: string;
	amount: number;
	content: Coupon | HTMLPoll;
	offer_type: "earn" | "spend";
}

export interface OfferList {
	offers: Offer[];
}

export const getOffers = async (options): Promise<ServiceResult<OfferList>> => {
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
			content: {
				content_type: "HTMLPoll",
				html: "<html><body><h1>title</h1><div>my poll</div></body></html>",
			} as HTMLPoll,
			description: "Tell us about yourself",
			id: img,
			image: assetsBase + img,
			offer_type: "earn",
			title: "Answer a poll",
		})).concat(spend.map<Offer>(img => ({
			amount: 8000,
			content: {
				content_type: "Coupon",
				description: "aaa-bbb-ccc-ddd",
			} as Coupon,
			description: "$10 gift card",
			id: img,
			image: assetsBase + img,
			offer_type: "spend",
			title: "Gift Card",
		})));

	return {
		code: 200,
		data: {
			offers,
		},
	};
};

export const createOrder = async (options): Promise<ServiceResult<Order>> => {
	return {
		code: 200,
		data: {
			id: "i_am_an_order",
		},
	};
};
