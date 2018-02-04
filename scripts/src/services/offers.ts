import { ServiceResult } from "./index";
import { Order } from "./orders";

export type Coupon = {
	description: string;
	content_type: "Coupon";
}

export type HTMLPoll = {
	content_type: "HTMLPoll";
	html: string;
}

export type HTMLPollAnswer = {
	content_type: "HTMLPollAnswer";
	answers: { [key: string]: string };
}

export type Offer = {
	id: string;
	title: string;
	description: string;
	image: string;
	amount: number;
	content: Coupon | HTMLPoll;
	offer_type: "earn" | "spend";
}

export type OfferList = {
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
	const IMAGE_BASE = "https://s3.amazonaws.com/kinmarketplace-assets/version1/";
	const offers =  
		earn.map<Offer>(img => ({
			id: img,
			title: "Answer a poll",
			description: "Tell us about yourself",
			image: IMAGE_BASE + img,
			amount: 4000,
			content: {"content_type": "HTMLPoll", "html": "<html><body><h1>title</h1><div>my poll</div></body></html>"} as HTMLPoll,
			offer_type: "earn",
		})).concat(spend.map<Offer>(img => ({
			id: img,
			title: "Gift Card",
			description: "$10 gift card",
			image: IMAGE_BASE + img,
			amount: 8000,
			content: {"content_type": "Coupon", "description": "aaa-bbb-ccc-ddd"} as Coupon,
			offer_type: "spend",
		})));

	return {
		code: 200,
		data: {
			offers
		}
	};
};

export const createOrder = async (options): Promise<ServiceResult<Order>> => {
	return {
		code: 200,
		data: {
			id: "i_am_an_order"
		}
	};
};
