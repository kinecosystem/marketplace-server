import { ServiceResult } from "./index";
import { Order } from "./orders";

export type Coupon = {
	description: string;
	content_type: "Coupon";
}

export type Question = {
	title: string;
	answers: string[];
}

export type SliderPoll = {
	min: number;
	max: number;
	content_type: "SliderPoll";
}

export type SliderPollAnswer = {
	value: number;
	content_type: "SliderPollAnswer";
}

export type MultiChoicePoll = {
	questions: Question[];
	content_type: "MultiChoicePoll";
}

export type MultiChoicePollAnswer = {
	answers: number[];
	content_type: "MultiChoicePollAnswer";
}

export type Limits = {
	supply: number;
	expiration: string; // formatted in iso 8601 in UTC (2018-01-29T10:47:46)
}

export type Offer = {
	id: string;
	title: string;
	description: string;
	image: string;
	amount: number;
	content: MultiChoicePoll | SliderPoll | Coupon;
	offer_type: "earn" | "spend";
	limits?: Limits;
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
			content: {} as Coupon,
			offer_type: "earn",
		})).concat(spend.map<Offer>(img => ({
			id: img,
			title: "Gift Card",
			description: "$10 gift card",
			image: IMAGE_BASE + img,
			amount: 8000,
			content: {} as Coupon,
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
