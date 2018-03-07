// wrapper for the payment service
import * as axios from "axios";
import { LoggerInstance } from "winston";
import { performance } from "perf_hooks";

import { getLogger } from "../logging";
import { getConfig } from "../config";

const config = getConfig();
const defaultLogger = getLogger();

interface PaymentRequest {
	amount: number;
	app_id: string;
	wallet_address: string;
	order_id: string;
	callback: string;
}

interface WalletCreationRequest {
	app_id: string;
	wallet_address: string;
}

export async function payTo(
		walletAddress: string, appId: string, amount: number, orderId: string, logger: LoggerInstance = defaultLogger) {
	logger.info(`paying ${amount} to ${walletAddress} with meta ${orderId}`);
	const payload: PaymentRequest = {
		amount,
		app_id: appId,
		wallet_address: walletAddress,
		order_id: orderId,
		callback: config.payment_complete_callback,
	};
	const t = performance.now();
	await axios.default.post(config.payment_service + "/orders", payload);
	console.log("wallet creation took " + (performance.now() - t) + "ms");
}

export async function createWallet(walletAddress: string, appId: string, logger: LoggerInstance = defaultLogger) {
	const payload: WalletCreationRequest = {
		wallet_address: walletAddress,
		app_id: appId,
	};
	const t = performance.now();
	await axios.default.post(config.payment_service + "/wallets", payload);
	console.log("wallet creation took " + (performance.now() - t) + "ms");
}

export async function getWalletData(walletAddress: string, logger: LoggerInstance = defaultLogger) {
	// XXX missing definitions
	const res = await axios.default.get(config.payment_service + "/wallets/" + walletAddress);
	return res.data;
}

export async function getPaymentData(orderId: string, logger: LoggerInstance = defaultLogger) {
	// XXX missing definitions
	const res = await axios.default.get(config.payment_service + "/orders/" + orderId);
	return res.data;
}
