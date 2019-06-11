// wrapper for the payment service
// TODO: this is used by both public and internal so should move to shared dir
import { performance } from "perf_hooks";
import { getDefaultLogger as logger } from "../../logging";
import { getConfig } from "../config";
import { BlockchainVersion } from "../../models/offers";
import { Application } from "../../models/applications";
import { getAxiosClient } from "../../utils/axios_client";
import { WalletApplication } from "../../models/users";
import { UserHasNoWallet } from "../../errors";

const config = getConfig();
const webhook = `${ config.internal_service }/v1/internal/webhook`;

const httpClient = getAxiosClient();

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
	logger().info(`paying ${ amount } to ${ walletAddress } with orderId ${ orderId }`);
	const payload: PaymentRequest = {
		amount,
		app_id: appId,
		recipient_address: walletAddress,
		id: orderId,
		callback: webhook,
	};
	const t = performance.now();

	const blockchainVersion = await WalletApplication.getBlockchainVersion(walletAddress);
	await httpClient.post(`${ getPaymentServiceUrl(blockchainVersion) }/payments`, payload);

	logger().info("pay to took " + (performance.now() - t) + "ms");
}

export async function submitTransaction(recepientAddress: string, senderAddress: string, appId: string, amount: number, orderId: string, transaction: string) {
	const blockchainVersion = await WalletApplication.getBlockchainVersion(recepientAddress);

	if (blockchainVersion === "2") {
		throw UserHasNoWallet(`${recepientAddress} not on kin3`);
	}

	logger().info(`submitTransaction of ${ amount } to ${ recepientAddress } from ${ senderAddress } with orderId ${ orderId }`);
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

	await httpClient.post(`${ getPaymentServiceUrl("3") }/tx/submit`, payload);

	logger().info("pay to took " + (performance.now() - t) + "ms");
}

export async function createWallet(walletAddress: string, appId: string, userId: string, blockchainVersion: BlockchainVersion) {
	const payload: WalletRequest = {
		id: userId,
		wallet_address: walletAddress,
		app_id: appId,
		callback: webhook,
	};
	const t = performance.now();

	await httpClient.post(`${ getPaymentServiceUrl(blockchainVersion) }/wallets`, payload);

	logger().info("wallet creation took " + (performance.now() - t) + "ms");
}

export async function getWalletData(walletAddress: string, options?: { timeout?: number, blockchainVersion?: BlockchainVersion }): Promise<Wallet> {
	options = options || {};
	options.blockchainVersion = options.blockchainVersion || "2";

	const res = await httpClient.get(`${ getPaymentServiceUrl(options.blockchainVersion) }/wallets/${ walletAddress }`, { timeout: options.timeout });
	return res.data;
}

export async function getPayments(walletAddress: string, options?: { timeout?: number, blockchainVersion?: BlockchainVersion }): Promise<{ payments: Payment[] }> {
	options = options || {};
	options.blockchainVersion = options.blockchainVersion || "2";

	const res = await httpClient.get(`${ getPaymentServiceUrl(options.blockchainVersion) }/wallets/${ walletAddress }/payments`, { timeout: options.timeout });
	return res.data;
}

export async function getPayment(orderId: string, options?: { timeout?: number, blockchainVersion?: BlockchainVersion }): Promise<Payment> {
	options = options || {};
	options.blockchainVersion = options.blockchainVersion || "2";

	const res = await httpClient.get(`${ getPaymentServiceUrl(options.blockchainVersion) }/payments/${ orderId }`, { timeout: options.timeout });
	return res.data;
}

export async function setWatcherEndpoint(addresses: string[]): Promise<Watcher> {
	// should be called from the internal server api upon creation
	const payload: Watcher = { wallet_addresses: addresses, callback: webhook };
	// only in blockchain v2 we have a watcher service
	const res = await httpClient.put(`${ getPaymentServiceUrl("2") }/services/${ SERVICE_ID }`, payload);
	return res.data;
}

export async function addWatcherEndpoint(address: string, paymentId: string, appId: string) {
	// only in blockchain v2 we have a watcher service
	const blockchainVersion = (await Application.get(appId))!.config.blockchain_version;

	if (blockchainVersion === "3") {
		return;
	}
	await httpClient.put(`${ getPaymentServiceUrl("2") }/services/${ SERVICE_ID }/watchers/${ address }/payments/${ paymentId }`);
}

export type BlockchainConfig = {
	horizon_url: string;
	network_passphrase: string;
	asset_issuer: string;
	asset_code: string;
};

export async function getBlockchainConfig(blockchainVersion: BlockchainVersion): Promise<BlockchainConfig> {
	const res = await httpClient.get(`${ getPaymentServiceUrl(blockchainVersion) }/config`);
	return res.data;
}

function getPaymentServiceUrl(blockchainVersion: BlockchainVersion): string {
	if (blockchainVersion === "3") {
		return config.payment_service_v3;
	}
	return config.payment_service;
}
