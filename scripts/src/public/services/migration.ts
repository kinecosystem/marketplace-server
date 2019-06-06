import * as express from "express";
import { BlockchainVersion } from "../../models/offers";
import { getAppBlockchainVersion } from "./applications";
import { GradualMigrationUser, WalletApplication } from "../../models/users";
import { getDefaultLogger as logger } from "../../logging";
import {
	hasKin2ZeroBalance,
	hasKin3Account,
	migrateZeroBalance,
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

export const accountStatus = async function(req: AccountStatusRequest, res: express.Response) {
	const publicAddress = req.params.public_address;
	const appId = req.params.app_id;

	logger().info(`handling account status request app_id: ${ appId } public_address: ${ publicAddress }`);

	const blockchainVersion = await getAppBlockchainVersion(appId);

	const wallet = await WalletApplication.findOne({ walletAddress: publicAddress });
	// if app is on kin3, and the wallet was created on kin2 but not on kin3, it should migrate
	let shouldMigrate = blockchainVersion === "3" && !!wallet && !wallet.createdDateKin3;

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
