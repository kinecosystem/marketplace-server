import { ServiceResult } from "./index";
import { HTMLPollAnswer } from "./offers";

export interface Order {
	id: string;
	recipient_address?: string;
}

export interface SpendResult {
	offer_type: "SpendResult";
	asset: {
		coupon_code: string;
		asset_type: "coupon_code";
	};
}

export interface EarnResult {
	offer_type: "EarnResult";
	transaction_id: string;
	sender_address: string;
}

export interface EarnSubmission {
	recipient_address: string;
	completed_form?: HTMLPollAnswer;
}

export interface SpendSubmission {
	transaction_id: string;
	sender_address?: string;
}

export interface SubmissionResult {
	order_id: string;
	content: SpendResult | EarnResult;
}

export const cancelOrder = async (options): Promise<ServiceResult<void>> => {
	return {
		code: 204,
	};
};

export const submitOrder = async (options): Promise<ServiceResult<SubmissionResult>> => {
	return {
		code: 200,
		data: {
			content: {
				offer_type: "EarnResult",
				sender_address: "i_am_a_sender",
				transaction_id: "i_am_a_transaction",
			},
			order_id: "i_am_an_order",
		},
	};
};
