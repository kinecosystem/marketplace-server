import * as express from "express";
import { BlockchainVersion } from "../../models/offers";
import { getAppBlockchainVersion } from "./applications";
import { GradualMigrationUser, Wallet, WalletApplication } from "../../models/users";
import { getDefaultLogger as logger } from "../../logging";
import {
	hasKin2ZeroBalance,
	hasKin3Account,
	migrateZeroBalance, rateLimitMigration,
	validateMigrationListJWT
} from "../../utils/migration";

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
};

// checks if should migrate flag can be set to false in case of zero wallet
async function shouldMigrateWallet(walletAddress: string): Promise<boolean> {
	if (
		// zero balance accounts don't need to migrate.
	// We check the balance of this account on kin2 prior to deciding
		await hasKin2ZeroBalance(walletAddress)
		// account must be created on kin3, otherwise the migrate call will block for a few seconds,
		// which we prefer the client will do
		&& await hasKin3Account(walletAddress)) {
		try {
			await migrateZeroBalance(walletAddress);
			await WalletApplication.updateCreatedDate(walletAddress, "createdDateKin3")
			return false;
		} catch (e) {
			logger().warn("migration on behalf of user failed ", { reason: (e as Error).message });
			// fail to call migrate - let user call it instead
		}
	}
	return true;
}

// return blockchainVersion for a wallet
async function getBlockchainVersionForWallet(wallet: WalletApplication, appId: string): Promise<{ blockchainVersion: BlockchainVersion, shouldMigrate: boolean }> {

	if (wallet.createdDateKin3) {
		return { blockchainVersion: "3", shouldMigrate: false };
	}

	const blockchainVersion = await getAppBlockchainVersion(appId);
	if (blockchainVersion === "3") {
		return { blockchainVersion: "3", shouldMigrate: await shouldMigrateWallet(wallet.walletAddress) };
	}

	const wallets = await Wallet.find({ select: ["userId"], where: { address: wallet.walletAddress } });
	const userIds = wallets.map(w => w.userId);
	const whitelisted = await GradualMigrationUser.findByIds(userIds);
	if (whitelisted.length > 0 && (whitelisted.some(w => !!w.migrationDate) || rateLimitMigration(appId))) {
		await GradualMigrationUser
			.createQueryBuilder("mig")
			.update()
			.whereInIds(userIds)
			.set({ migratedDate: new Date() })
			.execute(); // TODO move into GradualMigrationUser class
		return { blockchainVersion: "3", shouldMigrate: await shouldMigrateWallet(wallet.walletAddress) };
	}
	return { blockchainVersion: "3", shouldMigrate: false };
}

export const accountStatus = async function(req: AccountStatusRequest, res: express.Response) {
	const publicAddress = req.params.public_address;
	const appId = req.params.app_id;

	logger().info(`handling account status request app_id: ${ appId } public_address: ${ publicAddress }`);
	const wallet = await WalletApplication.findOne({ walletAddress: publicAddress });

	let blockchainVersion: BlockchainVersion;
	let shouldMigrate: boolean;
	if (!wallet) {
		blockchainVersion = await getAppBlockchainVersion(appId);
		shouldMigrate = false; // TODO shouldMigrate on kin3?
	} else {
		({ blockchainVersion, shouldMigrate } = await getBlockchainVersionForWallet(publicAddress, appId));
	}

	res.status(200).send({
		should_migrate: shouldMigrate,
		app_blockchain_version: blockchainVersion,
		// restore allowed when no wallet was found or the appId is equal
		restore_allowed: !wallet || wallet.appId === appId,
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

export const addGradualMigrationList = async function(req: AddGradualMigrationListRequest, res: express.Response) {
	const appId = req.params.app_id;
	const jwt = req.body.jwt;
	const appUserIds = await validateMigrationListJWT(jwt, appId);
	await GradualMigrationUser.addList(appId, appUserIds);
	res.status(204).send();
} as express.RequestHandler;
