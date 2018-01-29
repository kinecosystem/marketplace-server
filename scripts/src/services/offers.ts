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
	return {
		code: 200,
		data: {
			offers: []
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
