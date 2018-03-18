import moment = require("moment");
import { LoggerInstance } from "winston";

import { pick } from "../utils";
import * as db from "../models/orders";
import { Asset, Offer } from "../models/offers";
import { setWatcherEndpoint, Watcher } from "../public/services/payment";
import { removeDups } from "../utils";

export interface CompletedPayment {
	id: string;
	app_id: string;
	transaction_id: string;
	recipient_address: string;
	sender_address: string;
	amount: number;
	timestamp: string;
}

export async function paymentComplete(payment: CompletedPayment, logger: LoggerInstance) {
	const order = await db.Order.findOneById(payment.id);
	if (!order) {
		logger.error(`received payment for unknown order id ${payment.id}`);
		return;
	}

	if (order.status === "completed") {
		logger.warn(`received payment callback for already completed order ${payment.id}`);
		return;
	}

	// validate payment
	if (order.amount !== payment.amount) {
		logger.error(`payment <${payment.id}, ${payment.transaction_id}>` +
			`amount mismatch ${order.amount} !== ${payment.amount}`);
	}

	order.blockchainData = {
		transaction_id: payment.transaction_id,
		sender_address: payment.sender_address,
		recipient_address: payment.recipient_address,
	};

	if (order.type === "spend") {
		// XXX can we call findOne?
		const asset = (await Asset.find({ where: { offerId: order.offerId, ownerId: null }, take: 1 }))[0];
		order.value = asset.asOrderValue();
		asset.ownerId = order.userId;
		await asset.save();  // XXX should be in a transaction with order.save
	} else {
		// earn offer - no extra steps
	}

	order.completionDate = moment(payment.timestamp).toDate();
	order.status = "completed";
	await order.save();
	logger.info(`completed order with payment <${payment.id}, ${payment.transaction_id}>`);
}

export async function paymentFailed(payment: CompletedPayment, reason: string, logger: LoggerInstance) {
	const order = await db.Order.findOneById(payment.id);
	if (!order) {
		logger.error(`received payment for unknown order id ${payment.id}`);
		return;
	}

	order.blockchainData = pick(payment, "transaction_id", "sender_address", "recipient_address");
	order.completionDate = moment(payment.timestamp).toDate();
	order.status = "failed";
	order.value = { failure_message: reason };
	await order.save();
	logger.info(`failed order with payment <${payment.id}, ${payment.transaction_id}>`);
}

/**
 * register to get callbacks for incoming payments for all the active offers
 */
export async function initPaymentCallbacks(logger: LoggerInstance): Promise<Watcher> {
	const offers = await Offer.find({ type: "spend" }); // get all active spend offers
	// create a list of unique addresses
	const addresses: string[] = removeDups(offers.map(offer => offer.blockchainData.recipient_address));

	logger.info("setting payment watching addresses", { addresses });
	return await setWatcherEndpoint(addresses);
}
