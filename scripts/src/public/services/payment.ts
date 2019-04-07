// wrapper for the payment service
// TODO: this is used by both public and internal so should move to shared dir
import axios from "axios";
import { performance } from "perf_hooks";
import { getDefaultLogger as logger } from "../../logging";

import { getConfig } from "../config";
import { BlockchainVersion } from "../../models/offers";

const axiosRetry = require("axios-retry"); // TODO: nitzan this fails the tests: import axiosRetry from "axios-retry";

const config = getConfig();
const webhook = `${config.internal_service}/v1/internal/webhook`;
const DEFAULT_TIMEOUT = 300;
const client = axios.create({ timeout: DEFAULT_TIMEOUT });
axiosRetry(client, { retries: 6, retryCondition: () => true, shouldResetTimeout: true });

interface PaymentRequest {
	amount: number;
	app_id: string;
	recipient_address: string;
	id: string;
	callback: string;
}

interface SubmitTransactionRequest extends PaymentRequest {
	sender_address: string;
	transaction: string;
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

export async function payTo(walletAddress: string, appId: string, amount: number, orderId: string) {
	logger().info(`paying ${amount} to ${walletAddress} with orderId ${orderId}`);
	const payload: PaymentRequest = {
		amount,
		app_id: appId,
		recipient_address: walletAddress,
		id: orderId,
		callback: webhook,
	};
	const t = performance.now();
	await client.post(`${config.payment_service}/payments`, payload);
	logger().info("pay to took " + (performance.now() - t) + "ms");
}

export async function submitTransaction(recepientAddress: string, senderAddress: string, appId: string, amount: number, orderId: string, transaction: string) {
	logger().info(`paying ${amount} to ${recepientAddress} with orderId ${orderId}`);
	const payload: SubmitTransactionRequest = {
		amount,
		app_id: appId,
		recipient_address: recepientAddress,
		sender_address: senderAddress,
		id: orderId,
		callback: webhook,
		transaction,
	};
	const t = performance.now();
	await client.post(`${getPaymentServiceUrl("3")}/tx/submit`, payload);
	logger().info("pay to took " + (performance.now() - t) + "ms");
}

export async function createWallet(walletAddress: string, appId: string, id: string) {
	const payload: WalletRequest = {
		id,
		wallet_address: walletAddress,
		app_id: appId,
		callback: webhook,
	};
	const t = performance.now();
	await client.post(`${config.payment_service}/wallets`, payload); // TODO if this fails throw exception
	logger().info("wallet creation took " + (performance.now() - t) + "ms");
}

export async function getWalletData(walletAddress: string, options?: { timeout?: number }): Promise<Wallet> {
	options = options || {};
	const res = await client.get(`${config.payment_service}/wallets/${walletAddress}`, { timeout: options.timeout || DEFAULT_TIMEOUT });
	return res.data;
}

export async function getPayments(walletAddress: string, options?: { timeout?: number }): Promise<{ payments: Payment[] }> {
	options = options || {};
	const res = await client.get(`${config.payment_service}/wallets/${walletAddress}/payments`, { timeout: options.timeout || DEFAULT_TIMEOUT });
	return res.data;
}

export async function getPayment(orderId: string): Promise<Payment> {
	const res = await client.get(`${config.payment_service}/payments/${orderId}`);
	return res.data;
}

export async function setWatcherEndpoint(addresses: string[]): Promise<Watcher> {
	// What about native spend addresses?
	// XXX should be called from the internal server api upon creation
	const payload: Watcher = { wallet_addresses: addresses, callback: webhook };
	const res = await client.put(`${config.payment_service}/services/${SERVICE_ID}`, payload);
	return res.data;
}

export async function addWatcherEndpoint(address: string, paymentId: string, blockchainVersion: BlockchainVersion): Promise<Watcher> {
	const res = await client.put(`${ config.payment_service }/services/${SERVICE_ID}/watchers/${address}/payments/${paymentId}`);
	// const res = await client.put(`${getPaymentServiceUrl(blockchainVersion)}/services/${SERVICE_ID}/watchers/${address}/payments/${paymentId}`);
	return res.data;
}

export type BlockchainConfig = {
	horizon_url: string;
	network_passphrase: string;
	asset_issuer: string;
	asset_code: string;
};

export async function getBlockchainConfig(blockchainVersion: BlockchainVersion): Promise<BlockchainConfig> {
	const res = await client.get(`${config.payment_service}/config`);
	return res.data;
}

function getPaymentServiceUrl(blockchainVersion: BlockchainVersion): string {
	if (blockchainVersion === "3") {
		return config.payment_service_v3;
	}
	return config.payment_service;
}
