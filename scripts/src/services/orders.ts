import { Paging, ServiceResult } from "./index";
import { PollAnswer } from "./offers";
import { Offer } from "../models/offers";
import * as db from "../models/orders";

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
	completed_form?: PollAnswer;
}

export interface SpendSubmission {
	transaction_id: string;
	sender_address?: string;
}

export interface SubmissionResult {
	order_id: string;
	content: SpendResult | EarnResult;
}

export interface OrderList {
	orders: Order[];
	paging: Paging;
}

export interface BlockchainData {
	transaction_id?: string;
	sender_address?: string;
	recipient_address?: string;
}

export interface OrderResult {
	coupon_code?: string;
	reason?: string;
}

export interface OpenOrder {
	order_id: string;
	blockchain_data: BlockchainData;
	expiration: string;
}

export interface Order {
	order_id: string;
	blockchain_data: BlockchainData;
	result?: OrderResult;
	status: "completed" | "failed" | "pending";
	completion_date: string; // UTC ISO
	offer_type: "earn" | "spend";
	title: string;
	description: string;
	call_to_action?: string;
	amount: number;
}

const orders: Order[] = [
	{
		result: { reason: "Transaction failed" },
		status: "failed",
		order_id: "Tkjhds8s9d7fsdf6",
		completion_date: "2018-09-15T14:33:33Z",
		blockchain_data: {
			transaction_id: "717c9672505f480b8b87314c8ac8fb83f873fd1ed58f71678ccc1f3fa802ac41",
			sender_address: "GBS43BF24ENNS3KPACUZVKK2VYPOZVBQO2CISGZ777RYGOPYC2FT6S3K",
			recipient_address: "GBS43BF24ENNS3KPACUZVKK2VYPOZVBQO2CISGZ777RYGOPYC2FT6S3K",
		},
		offer_type: "spend",
		title: "Spotify",
		description: "2 week subscription",
		call_to_action: "tap to reveal coupon",
		amount: 32000,
	},
	{
		result: { reason: "Please check again later" },
		status: "pending",
		order_id: "Tkjhds8s9d7fsdf5",
		completion_date: "2018-09-14T14:33:33Z",
		blockchain_data: {
			transaction_id: "717c9672505f480b8b87314c8ac8fb83f873fd1ed58f71678ccc1f3fa802ac41",
			sender_address: "GBS43BF24ENNS3KPACUZVKK2VYPOZVBQO2CISGZ777RYGOPYC2FT6S3K",
			recipient_address: "GBS43BF24ENNS3KPACUZVKK2VYPOZVBQO2CISGZ777RYGOPYC2FT6S3K",
		},
		offer_type: "earn",
		title: "Dunkin Donuts",
		description: "completed poll",
		amount: 4100,
	},
	{
		status: "pending",
		order_id: "Tkjhds8s9d7fsdf4",
		completion_date: "2018-09-13T14:33:33Z",
		blockchain_data: {
			transaction_id: "717c9672505f480b8b87314c8ac8fb83f873fd1ed58f71678ccc1f3fa802ac41",
			sender_address: "GBS43BF24ENNS3KPACUZVKK2VYPOZVBQO2CISGZ777RYGOPYC2FT6S3K",
			recipient_address: "GBS43BF24ENNS3KPACUZVKK2VYPOZVBQO2CISGZ777RYGOPYC2FT6S3K",
		},
		offer_type: "spend",
		title: "Spotify",
		description: "2 week subscription",
		call_to_action: "tap to reveal coupon",
		amount: 6030,
	},
	{
		status: "pending",
		order_id: "Tkjhds8s9d7fsdf3",
		completion_date: "2018-09-12T14:33:33Z",
		blockchain_data: {
			transaction_id: "717c9672505f480b8b87314c8ac8fb83f873fd1ed58f71678ccc1f3fa802ac41",
			sender_address: "GBS43BF24ENNS3KPACUZVKK2VYPOZVBQO2CISGZ777RYGOPYC2FT6S3K",
			recipient_address: "GBS43BF24ENNS3KPACUZVKK2VYPOZVBQO2CISGZ777RYGOPYC2FT6S3K",
		},
		offer_type: "earn",
		title: "Dunkin Donuts",
		description: "completed poll",
		amount: 7100,
	},
	{
		result: { coupon_code: "XXX-YYY-ZZZ" },
		status: "completed",
		order_id: "Tkjhds8s9d7fsdf2",
		completion_date: "2018-09-11T14:33:33Z",
		blockchain_data: {
			transaction_id: "717c9672505f480b8b87314c8ac8fb83f873fd1ed58f71678ccc1f3fa802ac41",
			sender_address: "GBS43BF24ENNS3KPACUZVKK2VYPOZVBQO2CISGZ777RYGOPYC2FT6S3K",
			recipient_address: "GBS43BF24ENNS3KPACUZVKK2VYPOZVBQO2CISGZ777RYGOPYC2FT6S3K",
		},
		offer_type: "spend",
		title: "Spotify",
		description: "2 week subscription",
		call_to_action: "tap to reveal coupon",
		amount: 3000,
	},
	{
		status: "completed",
		order_id: "Tkjhds8s9d7fsdf1",
		completion_date: "2018-09-10T14:33:33Z",
		blockchain_data: {
			transaction_id: "717c9672505f480b8b87314c8ac8fb83f873fd1ed58f71678ccc1f3fa802ac41",
			sender_address: "GBS43BF24ENNS3KPACUZVKK2VYPOZVBQO2CISGZ777RYGOPYC2FT6S3K",
			recipient_address: "GBS43BF24ENNS3KPACUZVKK2VYPOZVBQO2CISGZ777RYGOPYC2FT6S3K",
		},
		offer_type: "earn",
		title: "Dunkin Donuts",
		description: "completed poll",
		amount: 4000,
	},
];

export async function getOrder(orderId: string): Promise<Order> {
	orders.forEach(order => {
		if (order.order_id === orderId) {
			return order;
		}
	});
	throw Error; // XXX throw and exception that is convirtable to json
}

export async function createOrder(offerId): Promise<OpenOrder> {
	return {
		order_id: "Tkjhds8s9d7fsdf6",
		blockchain_data: { recipient_address: "YYYYYYY" },
		expiration: "2018-02-22T15:55:44Z",
	};
}

export async function submitOrder(options): Promise<void> {
	return;
}

export async function cancelOrder(options): Promise<void> {
	return;
}

export async function getOrderHistory(): Promise<OrderList> {
	return {
		orders,
		paging: {
			cursors: {
				after: "MTAxNTExOTQ1MjAwNzI5NDE",
				before: "NDMyNzQyODI3OTQw",
			},
			previous: "https://graph.facebook.com/me/albums?limit=25&before=NDMyNzQyODI3OTQw",
			next: "https://graph.facebook.com/me/albums?limit=25&after=MTAxNTExOTQ1MjAwNzI5NDE=",
		},
	};
}
