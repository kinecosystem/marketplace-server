import { LoggerInstance } from "winston";

import * as metrics from "../metrics";
import * as db from "../models/orders";
import { User } from "../models/users";
import { pick, removeDuplicates } from "../utils";
import { Asset, Offer, OrderValue } from "../models/offers";
import { setWatcherEndpoint, Watcher } from "../public/services/payment";
import { create as createSpendOrderPaymentConfirmed } from "../analytics/events/spend_order_payment_confirmed";
import { create as createStellarAccountCreationFailed } from "../analytics/events/stellar_account_creation_failed";
import { create as createStellarAccountCreationSucceeded } from "../analytics/events/stellar_account_creation_succeeded";
import { create as createEarnTransactionBroadcastToBlockchainFailed } from "../analytics/events/earn_transaction_broadcast_to_blockchain_failed";
import { create as createEarnTransactionBroadcastToBlockchainSucceeded } from "../analytics/events/earn_transaction_broadcast_to_blockchain_succeeded";

import { sign as signJWT } from "./jwt";
import { AssetUnavailable, BlockchainError, WrongAmount, WrongRecipient, WrongSender } from "../errors";
import { setFailedOrder } from "../public/services/orders";

const BLOCKCHAIN = "stellar-testnet";

export type WalletCreationSuccessData = {
	id: string; // user id
};

export async function walletCreationSuccess(data: WalletCreationSuccessData, logger: LoggerInstance) {
	createStellarAccountCreationSucceeded(data.id).report();
	logger.info("wallet created", { userId: data.id });
}

export type WalletCreationFailureData = {
	id: string; // user id
	reason: string;
};

export async function walletCreationFailure(data: WalletCreationFailureData, logger: LoggerInstance) {
	createStellarAccountCreationFailed(data.id, data.reason).report();
	logger.warn("wallet failed to create", { userId: data.id, reason: data.reason });
}

export interface CompletedPayment {
	id: string;
	app_id: string;
	transaction_id: string;
	recipient_address: string;
	sender_address: string;
	amount: number;
	timestamp: string;
}

export interface FailedPayment {
	id: string;
	reason: string;
}

export type JWTBodyPaymentConfirmation = {
	offer_id: string;
	sender_user_id?: string;
	recipient_user_id?: string;
	payment: {
		blockchain: string;
		transaction_id: string;
	}
};

async function getPaymentJWT(order: db.Order, appId: string, userId: string): Promise<OrderValue> {
	const loggedInContext = order.contextFor(userId)!;
	const payload: JWTBodyPaymentConfirmation = {
		offer_id: order.offerId,
		payment: {
			blockchain: BLOCKCHAIN,
			transaction_id: order.blockchainData.transaction_id!
		}
	};

	if (order.isP2P()) {
		payload.sender_user_id = order.sender.appUserId;
		payload.recipient_user_id = order.recipient.appUserId;
	} else if (loggedInContext.type === "earn") {
		payload.recipient_user_id = loggedInContext.user.appUserId;
	} else {
		payload.sender_user_id = loggedInContext.user.appUserId;
	}

	return {
		type: "payment_confirmation",
		jwt: signJWT("payment_confirmation", payload, appId !== "kik" ? "rs512" : "es256") // TODO all apps should run with es256 keys
	};
}

export async function paymentComplete(payment: CompletedPayment, logger: LoggerInstance) {
	const order = await db.Order.getOne(payment.id);
	if (!order) {
		logger.error(`received payment for unknown order id ${ payment.id }`);
		return;
	}

	order.forEachContext(context => {
		if (context.type === "earn") {
			createEarnTransactionBroadcastToBlockchainSucceeded(context.user.id, payment.transaction_id, order.offerId, order.id).report();
		} else {
			createSpendOrderPaymentConfirmed(context.user.id, payment.transaction_id, order.offerId, order.id, order.isExternalOrder(), order.origin).report();
		}
	});

	if (order.status === "completed") {
		logger.warn(`received payment callback for already completed order ${ payment.id }`);
		return;
	}

	// validate payment
	if (order.amount !== payment.amount) {
		logger.error(`payment <${ payment.id }, ${ payment.transaction_id }>` +
			`amount mismatch ${ order.amount } !== ${ payment.amount }`);
		// 2. don't complete the transaction? complete only if the server got more than expected?

		await setFailedOrder(order, WrongAmount());
		return;
	}

	if (order.blockchainData!.recipient_address !== payment.recipient_address) {
		logger.error(`payment <${ payment.id }, ${ payment.transaction_id }>` +
			`addresses recipient mismatch ${ order.blockchainData!.recipient_address } !== ${ payment.recipient_address }`);

		await setFailedOrder(order, WrongRecipient());
		return;
	}

	if (order.blockchainData!.sender_address !== payment.sender_address) {
		logger.error(`payment <${ payment.id }, ${ payment.transaction_id }>` +
			`addresses sender mismatch ${ order.blockchainData!.sender_address } !== ${ payment.sender_address }`);

		await setFailedOrder(order, WrongSender());
		return;
	}

	order.blockchainData = pick(payment, "transaction_id", "sender_address", "recipient_address");

	if (order.isMarketplaceOrder()) {
		if (order.type === "spend") {
			// XXX can we call findOne?
			const asset = await Asset.findOne({ where: { offerId: order.offerId, ownerId: null } });
			if (!asset) {
				await setFailedOrder(order, AssetUnavailable());
				return;
			} else {
				order.value = asset.asOrderValue();
				asset.ownerId = order.user.id;
				await asset.save();  // XXX should be in a transaction with order.save
			}
		}
	} else if (order.isP2P()) {
		order.value = await getPaymentJWT(order, payment.app_id, order.sender.id);
	} else if (order.isNormal()) {
		order.value = await getPaymentJWT(order, payment.app_id, order.user.id);
	}

	if (order.status !== "pending") {
		// can be either failed or opened
		logger.info("a non pending order turned completed", { order, status: order.status });
		order.error = null;
	}

	const prevStatus = order.status;
	const prevStatusDate = order.currentStatusDate;
	order.setStatus("completed");
	await order.save();

	order.forEachContext(context => {
		metrics.completeOrder(context.type, order.offerId, prevStatus, (order.currentStatusDate.getTime() - prevStatusDate.getTime()) / 1000);
	});

	logger.info(`completed order with payment <${ payment.id }, ${ payment.transaction_id }>`);
}

export async function paymentFailed(payment: FailedPayment, logger: LoggerInstance) {
	const order = await db.Order.getOne(payment.id);
	if (!order) {
		logger.error(`received payment for unknown order id ${ payment.id }`);
		return;
	}

	if (order.isP2P()) {
		createEarnTransactionBroadcastToBlockchainFailed(order.recipient.id, payment.reason, order.offerId, order.id).report();
	} else if (order.isNormal() && order.type === "earn") {
		createEarnTransactionBroadcastToBlockchainFailed(order.user.id, payment.reason, order.offerId, order.id).report();
	}

	await setFailedOrder(order, BlockchainError(payment.reason));
	logger.info(`failed order with payment <${payment.id}>`);
}

/**
 * register to get callbacks for incoming payments for all the active offers
 */
export async function initPaymentCallbacks(logger: LoggerInstance): Promise<Watcher> {
	const offers = await Offer.find<Offer>({ type: "spend" }); // get all active spend offers
	// create a list of unique addresses
	const addresses = removeDuplicates(offers.map(offer => offer.blockchainData.recipient_address!));

	logger.info("setting payment watching addresses", { addresses });
	return await setWatcherEndpoint(addresses);
}
