import * as express from "express";
import { BlockchainVersion } from "../../models/offers";
import { GradualMigrationUser, Wallet, WalletApplication } from "../../models/users";
import { getDefaultLogger as logger } from "../../logging";
import {
	hasKin2ZeroBalance,
	hasKin3Account,
	migrateZeroBalance,
	validateMigrationListJWT, withinMigrationRateLimit
} from "../../utils/migration";
import { Application } from "../../models/applications";
import { NoSuchApp } from "../../errors";
import * as metrics from "../../metrics";

type AccountStatusRequest = express.Request & {
	params: {
		public_address: string;
		app_id: string;
	}
};

type AccountMigrationStatus = {
	should_migrate: boolean;
	app_blockchain_version: BlockchainVersion;
	restore_allowed: boolean;
	wallet_blockchain_version: BlockchainVersion;
};

// return true if user can skip migration - checks if zero balance optimization can be performed
async function canSkipMigration(walletAddress: string): Promise<boolean> {
	if (
		// zero balance accounts don't need to migrate.
	// We check the balance of this account on kin2 prior to deciding
		await hasKin2ZeroBalance(walletAddress)
		// account must be created on kin3, otherwise the migrate call will block for a few seconds,
		// which we prefer the client will do
		&& await hasKin3Account(walletAddress)) {
		try {
			await migrateZeroBalance(walletAddress);
			// XXX - this is called by migration servic: await WalletApplication.updateCreatedDate(walletAddress, "createdDateKin3")
			logger().info(`can skip migration for ${ walletAddress }`);
			return true;
		} catch (e) {
			logger().warn("migration on behalf of user failed ", { reason: (e as Error).message });
			// fail to call migrate - let user call it instead
		}
	}
	logger().info(`can NOT skip migration for ${ walletAddress }`);
	return false;
}

// return blockchainVersion for a wallet
async function getBlockchainVersionForWallet(wallet: WalletApplication, app: Application): Promise<{ blockchainVersion: BlockchainVersion, shouldMigrate: boolean }> {

	if (wallet.createdDateKin3) {
		logger().info(`wallet created on kin3 - dont migrate ${ wallet.walletAddress }`);
		metrics.migrationInfo(app.id, "wallet_on_kin3");
		return { blockchainVersion: "3", shouldMigrate: false };
	}

	if (app.config.blockchain_version === "3" && app.config.gradual_migration_date && await withinMigrationRateLimit(app.id, wallet.walletAddress)) {
		logger().info(`app on kin3 - should migrate (gradual kill switch) ${ wallet.walletAddress }`);
		metrics.migrationInfo(app.id, "app_on_kin3");
		return { blockchainVersion: "3", shouldMigrate: true };
	}

	if (app.config.blockchain_version === "3" && !app.config.gradual_migration_date) {
		logger().info(`app on kin3 - should migrate ${ wallet.walletAddress }`);
		metrics.migrationInfo(app.id, "app_on_kin3");
		return { blockchainVersion: "3", shouldMigrate: true };
	}

	if (app.shouldApplyGradualMigration()) {
		const whitelisted = await GradualMigrationUser.findByWallet(wallet.walletAddress);
		if (whitelisted.length > 0 && (whitelisted.some(w => !!w.migrationDate) || await withinMigrationRateLimit(app.id, wallet.walletAddress))) {
			await GradualMigrationUser.setAsMigrated(whitelisted.map(w => w.userId));
			logger().info(`kin2 user on migration list - should migrate ${ wallet.walletAddress }`);
			metrics.migrationInfo(app.id, "gradual_migration");
			return { blockchainVersion: "3", shouldMigrate: true };
		}
		// else, user is not whitelisted or is whitelisted but rate limit applied
	}
	logger().info(`kin2 user not on migration list - dont migrate ${ wallet.walletAddress }`);
	return { blockchainVersion: "2", shouldMigrate: false };
}

export const accountStatus = async function(req: AccountStatusRequest, res: express.Response) {
	const publicAddress: string = req.params.public_address;
	const appId: string = req.params.app_id;
	const app = await Application.get(appId);
	if (!app) {
		throw NoSuchApp(appId);
	}
	logger().info(`handling account status request app_id: ${ appId } public_address: ${ publicAddress }`);
	const wallet = await WalletApplication.get(publicAddress);

	let blockchainVersion: BlockchainVersion;
	let shouldMigrate: boolean;
	if (!wallet) {
		blockchainVersion = app.config.blockchain_version;
		shouldMigrate = false; // TODO shouldMigrate non existing wallet on kin3?
	} else {
		({ blockchainVersion, shouldMigrate } = await getBlockchainVersionForWallet(wallet, app));
		if (shouldMigrate && await canSkipMigration(publicAddress)) {
			metrics.skipMigration(appId);
			shouldMigrate = false;
		}
	}
	logger().info(`handling account status response app_id: ${ appId } public_address: ${ publicAddress }, ${ shouldMigrate }, ${ blockchainVersion }`);

	res.status(200).send({
		should_migrate: shouldMigrate,
		app_blockchain_version: blockchainVersion,
		// restore allowed when no wallet was found or the appId is equal
		restore_allowed: !wallet || wallet.appId === appId,
		wallet_blockchain_version: blockchainVersion,
	} as AccountMigrationStatus);
} as express.RequestHandler;

type AddGradualMigrationListRequest = express.Request & {
	params: {
		app_id: string;
	};
	body: {
		jwt: string;
	};
};

export const addGradualMigrationUsers = async function(req: AddGradualMigrationListRequest, res: express.Response) {
	const appId = req.params.app_id;
	const jwt = req.body.jwt;
	const appUserIds = await validateMigrationListJWT(jwt, appId);
	await GradualMigrationUser.addList(appId, appUserIds);
	res.status(204).send();
} as express.RequestHandler;
