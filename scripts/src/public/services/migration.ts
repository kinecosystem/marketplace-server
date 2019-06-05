import * as express from "express";
import { BlockchainVersion } from "../../models/offers";
import { getAppBlockchainVersion } from "./applications";
import { WalletApplication } from "../../models/users";
import { getDefaultLogger as logger } from "../../logging";
import { BlockchainConfig, getBlockchainConfig } from "./payment";
import { getConfig } from "../config";

import { getAxiosClient } from "../../utils/axios_client";

const httpClient = getAxiosClient();
let BLOCKCHAIN: BlockchainConfig;
let BLOCKCHAIN3: BlockchainConfig;
const ALREADY_MIGRATED_ERROR = 4002;

type WalletResponse = {
	balances: Array<{
		balance: string,
		asset_type: "credit_alphanum4" | "native",
		asset_code?: string,
		asset_issuer?: string
	}>
};

type AccountMigrationStatus = {
	should_migrate: boolean;
	app_blockchain_version: BlockchainVersion;
	restore_allowed: boolean;
};

export async function init() {
	BLOCKCHAIN = await getBlockchainConfig("2");
	BLOCKCHAIN3 = await getBlockchainConfig("3");
}

// return True if wallet has zero balance on kin2
async function hasKin2ZeroBalance(walletAddress: string): Promise<boolean> {
	try {
		const res = await httpClient.get<WalletResponse>(`${ BLOCKCHAIN.horizon_url }/accounts/${ walletAddress }`);
		for (const balance of res.data.balances) {
			if (balance.asset_issuer === BLOCKCHAIN.asset_issuer &&
				balance.asset_code === BLOCKCHAIN.asset_code) {
				return parseFloat(balance.balance) === 0;
			}
		}
		return true; // no balance is zero balance
	} catch (e) {
		logger().warn("couldn't reach horizon to check user balance - assuming non-zero");
		return false; // assume user has non zero balance if can't reach horizon
	}
}

async function hasKin3Account(walletAddress: string) {
	try {
		await httpClient.get<WalletResponse>(`${ BLOCKCHAIN3.horizon_url }/accounts/${ walletAddress }`);
		return true;
	} catch (e) {
		return false;
	}
}

class MigrationError extends Error {
}

// returns true if migration call succeeded
async function migrateZeroBalance(walletAddress: string): Promise<void> {
	const res = await httpClient.post(`${ getConfig().migration_service }/migrate?address=${ walletAddress }`,
		null,
		{ validateStatus: status => status < 500 }); // allow 4xx errors
	if (res.status < 300 ||
		res.status === 400 && res.data.code === ALREADY_MIGRATED_ERROR) {
		return;
	}

	throw new MigrationError(`migration failed with status: ${ res.status }`);
}

export const accountStatus = async function(req: express.Request, res: express.Response) {
	const publicAddress = req.params.public_address;
	const appId = req.params.app_id;
	logger().info(`handling account status request app_id: ${ appId } public_address: ${ publicAddress }`);

	const app_blockchain_version = await getAppBlockchainVersion(appId);

	const wallet = await WalletApplication.findOne({ walletAddress: publicAddress });
	// if app is on kin3, and the wallet was created on kin2 but not on kin3, it should migrate
	let shouldMigrate = app_blockchain_version === "3" && !!wallet && !wallet.createdDateKin3;

	if (shouldMigrate
		&& wallet
		// zero balance accounts don't need to migrate.
		// We check the balance of this account on kin2 prior to deciding
		&& await hasKin2ZeroBalance(wallet.walletAddress)
		// account must be created on kin3, otherwise the migrate call will block for a few seconds,
		// which we prefer the client will do
		&& await hasKin3Account(wallet.walletAddress)) {
		try {
			await migrateZeroBalance(wallet.walletAddress);
			shouldMigrate = false;
		} catch (e) {
			logger().warn("migration on behalf of user failed ", { reason: (e as Error).message });
			// fail to call migrate - let user call it instead
			shouldMigrate = true;
		}
	}

	res.status(200).send({
		should_migrate: shouldMigrate,
		app_blockchain_version,
		// restore allowed when no wallet was found or the appId is equal
		restore_allowed: !wallet || wallet.appId === appId,
	} as AccountMigrationStatus);
} as express.RequestHandler;
