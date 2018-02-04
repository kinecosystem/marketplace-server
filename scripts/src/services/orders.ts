import { ServiceResult } from "./index";
import { HTMLPollAnswer } from "./offers";

export type Order = {
	id: string;
	recipient_address?: string;
}

export type SpendResult = {
	offer_type: "SpendResult";
	asset: {
		coupon_code: string;
		asset_type: "coupon_code"
	}
}

export type EarnResult = {
	offer_type: "EarnResult";
	transaction_id: string;
	sender_address: string;
}

export type EarnSubmission = {
	recipient_address: string;
	completed_form?: HTMLPollAnswer;
}

export type SpendSubmission = {
	transaction_id: string;
	sender_address?: string;
}

export type SubmissionResult = {
	order_id: string;
	content: SpendResult | EarnResult;
}

export const cancelOrder = async (options): Promise<ServiceResult<void>> => {
	return {
		code: 204
	};
};

export const submitOrder = async (options): Promise<ServiceResult<SubmissionResult>> => {
	return {
		code: 200,
		data: {
			order_id: "i_am_an_order",
			content: {
				offer_type: "EarnResult",
				transaction_id: "i_am_a_transaction",
				sender_address: "i_am_a_sender"
			}
		}
	};
};
