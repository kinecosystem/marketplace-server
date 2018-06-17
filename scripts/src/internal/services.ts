import { LoggerInstance } from "winston";

import * as metrics from "../metrics";
import * as db from "../models/orders";
import { User } from "../models/users";
import { pick, removeDuplicates } from "../utils";
import { Asset, Offer, OrderValue } from "../models/offers";
import { setWatcherEndpoint, Watcher } from "../public/services/payment";
import { create as createWalletCreationSucceeded } from "../analytics/events/wallet_creation_succeeded";
import { create as createStellarAccountCreationFailed } from "../analytics/events/stellar_account_creation_failed";
import { create as createStellarAccountCreationSucceeded } from "../analytics/events/stellar_account_creation_succeeded";

import { sign as signJWT } from "./jwt";

const BLOCKCHAIN = "stellar-testnet";

export type WalletCreationSuccessData = {
	id: string; // user id
};

export async function walletCreationSuccess(data: WalletCreationSuccessData) {
	createWalletCreationSucceeded(data.id).report();
	createStellarAccountCreationSucceeded(data.id).report();
}

export type WalletCreationFailureData = {
	id: string; // user id
	reason: string;
};

export async function walletCreationFailure(data: WalletCreationFailureData) {
	createStellarAccountCreationFailed(data.id, data.reason).report();
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

export type JWTBodyPaymentConfirmation = {
	offer_id: string;
	sender_user_id?: string;
	recipient_user_id?: string;
	payment: {
		blockchain: string;
		transaction_id: string;
	}
};

async function getPaymentJWT(order: db.Order, appId: string): Promise<OrderValue> {
	const user: User = (await User.findOneById(order.userId))!;
	const payload: JWTBodyPaymentConfirmation = {
		offer_id: order.offerId,
		payment: {
			blockchain: BLOCKCHAIN,
			transaction_id: order.blockchainData.transaction_id!
		}
	};
	if (order.type === "earn") {
		payload.recipient_user_id = user.appUserId;
	} else {
		payload.sender_user_id = user.appUserId;
	}
	// XXX if it's p2p, add both recipient and sender user_ids

	return {
		type: "payment_confirmation",
		jwt: signJWT("payment_confirmation", payload, appId !== "kik" ? "rs512_0" : "es256_0") // TODO all apps should run with es256 keys
	};
}

export async function paymentComplete(payment: CompletedPayment, logger: LoggerInstance) {
	const order = await db.Order.findOneById(payment.id);
	if (!order) {
		logger.error(`received payment for unknown order id ${ payment.id }`);
		return;
	}

	if (order.status === "completed") {
		logger.warn(`received payment callback for already completed order ${ payment.id }`);
		return;
	}

	// validate payment
	if (order.amount !== payment.amount) {
		logger.error(`payment <${ payment.id }, ${ payment.transaction_id }>` +
			`amount mismatch ${ order.amount } !== ${ payment.amount }`);
		// 2. don't complete the transaction? complete only if the server got more than expected?
		// TODO: report to error reporting service
		order.error = {
			code: 1113,
			error: "wrong_amount",
			message: "transaction failed"
		};
		order.setStatus("failed");
		await order.save();
		return;
	}

	if (order.blockchainData!.recipient_address !== payment.recipient_address) {
		logger.error(`payment <${ payment.id }, ${ payment.transaction_id }>` +
			`addresses recipient mismatch ${ order.blockchainData!.recipient_address } !== ${ payment.recipient_address }`);

		// TODO: report to error reporting service
		order.error = {
			code: 1112,
			error: "wrong_address",
			message: "transaction failed"
		};
		order.setStatus("failed");
		await order.save();
		return;
	}

	if (order.blockchainData!.sender_address !== payment.sender_address) {
		logger.error(`payment <${ payment.id }, ${ payment.transaction_id }>` +
			`addresses sender mismatch ${ order.blockchainData!.sender_address } !== ${ payment.sender_address }`);
		// TODO: report to error reporting service
		order.error = {
			code: 1111,
			error: "wrong_address",
			message: "transaction failed"
		};
		order.setStatus("failed");
		await order.save();
		return;
	}

	order.blockchainData = pick(payment, "transaction_id", "sender_address", "recipient_address");

	if (order.isMarketplaceOrder()) {
		if (order.type === "spend") {
			// XXX can we call findOne?
			const asset = await Asset.findOne({ where: { offerId: order.offerId, ownerId: null } });
			if (!asset) {
				// TODO: report to error reporting service
				order.error = {
					code: 1114,
					error: "unavailable_asset",
					message: "failed transaction"
				};
				order.setStatus("failed");
				await order.save();
				return;
			} else {
				order.value = asset.asOrderValue();
				asset.ownerId = order.userId;
				await asset.save();  // XXX should be in a transaction with order.save
			}
		}
	} else if (order.isExternalOrder()) {
		// XXX for p2p don't put the JWT in the recipient order's value
		// XXX for p2p create a completed order for the recipient too
		order.value = await getPaymentJWT(order, payment.app_id);
	}

	if (order.status !== "pending") {
		// can be either failed or opened
		logger.info("a non pending order turned completed", { order, status: order.status });
		order.error = null;
	}

	order.setStatus("completed");
	await order.save();

	metrics.completeOrder(order.type, order.offerId);
	logger.info(`completed order with payment <${ payment.id }, ${ payment.transaction_id }>`);
}

export async function paymentFailed(payment: CompletedPayment, reason: string, logger: LoggerInstance) {
	// TODO: doody, decide what you wanna do here

	/*const order = await db.Order.findOneById(payment.id);
	if (!order) {
		logger.error(`received payment for unknown order id ${payment.id}`);
		return;
	}

	order.blockchainData = pick(payment, "transaction_id", "sender_address", "recipient_address");
	order.completionDate = moment(payment.timestamp).toDate();
	order.status = "failed";
	order.error = { message: reason, error: "blockchain_error", code: 5001 };  // XXX where do I define this error + codes?
	await order.save();
	logger.info(`failed order with payment <${payment.id}, ${payment.transaction_id}>`);
	*/
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
