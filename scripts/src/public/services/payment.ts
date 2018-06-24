// wrapper for the payment service
// TODO: this is used by both public and internal so should move to shared dir
import * as axios from "axios";
import { LoggerInstance } from "winston";
import { performance } from "perf_hooks";

import { getConfig } from "../config";

const config = getConfig();
const webhook = `${config.internal_service}/v1/internal/webhook`;

interface PaymentRequest {
	amount: number;
	app_id: string;
	recipient_address: string;
	id: string;
	callback: string;
}

export interface Payment {
	amount: number;
	app_id: string;
	recipient_address: string;
	id: string;
	transaction_id: string;
	sender_address: string;
	timestamp: string;
}

interface WalletRequest {
	id: string;
	app_id: string;
	wallet_address: string;
	callback: string;
}

export interface Wallet {
	wallet_address: string;
	kin_balance: number;
	native_balance: number;
}

export interface Watcher {
	wallet_addresses: string[];
	callback: string;
	service_id?: string;
}

const SERVICE_ID = "marketplace";

export async function payTo(
	walletAddress: string, appId: string, amount: number, orderId: string, logger: LoggerInstance) {
	logger.info(`paying ${amount} to ${walletAddress} with orderId ${orderId}`);
	const payload: PaymentRequest = {
		amount,
		app_id: appId,
		recipient_address: walletAddress,
		id: orderId,
		callback: webhook,
	};
	const t = performance.now();
	await axios.default.post(`${config.payment_service}/payments`, payload);
	console.log("pay to took " + (performance.now() - t) + "ms");
}

export async function createWallet(walletAddress: string, appId: string, id: string, logger: LoggerInstance) {
	const payload: WalletRequest = {
		id,
		wallet_address: walletAddress,
		app_id: appId,
		callback: webhook,
	};
	const t = performance.now();
	await axios.default.post(`${config.payment_service}/wallets`, payload);
	logger.info("wallet creation took " + (performance.now() - t) + "ms");
}

export async function getWalletData(walletAddress: string, logger: LoggerInstance): Promise<Wallet> {
	const res = await axios.default.get(`${config.payment_service}/wallets/${walletAddress}`);
	return res.data;
}

export async function getPaymentData(orderId: string, logger: LoggerInstance): Promise<Payment> {
	const res = await axios.default.get(`${config.payment_service}/payments/${orderId}`);
	return res.data;
}

export async function setWatcherEndpoint(addresses: string[]): Promise<Watcher> {
	// What about native spend addresses?
	// XXX should be called from the internal server api upon creation
	const payload: Watcher = { wallet_addresses: addresses, callback: webhook };
	const res = await axios.default.put(`${config.payment_service}/watchers/${SERVICE_ID}`, payload);
	return res.data;
}

export async function addWatcherEndpoint(addresses: string[]): Promise<Watcher> {
	const payload: Watcher = { wallet_addresses: addresses, callback: webhook };
	const res = await axios.default.post(`${config.payment_service}/watchers/${SERVICE_ID}`, payload);
	return res.data;
}

export type BlockchainConfig = {
	horizon_url: string;
	network_passphrase: string;
	asset_issuer: string;
	asset_code: string;
};

export async function getBlockchainConfig(logger: LoggerInstance): Promise<BlockchainConfig> {
	const res = await axios.default.get(`${config.payment_service}/config`);
	return res.data;
}
