import * as express from "express";
import { BlockchainVersion } from "../../models/offers";
import { getAppBlockchainVersion } from "./applications";
import { WalletApplication } from "../../models/users";
import { getDefaultLogger as logger } from "../../logging";

type AccountMigrationStatus = {
	should_migrate: boolean;
	app_blockchain_version: BlockchainVersion;
	restore_allowed: boolean;
};

export const accountStatus = async function(req: express.Request, res: express.Response) {
	const publicAddress = req.params.public_address;
	const appId = req.params.app_id;
	logger().info(`handling account status request app_id: ${ appId } public_address: ${ publicAddress }`);

	const app_blockchain_version = await getAppBlockchainVersion(appId);

	const wallet = await WalletApplication.findOne({ walletAddress: publicAddress });
	// if app is on kin3, and the wallet was created on kin2 but not on kin3, it should migrate
	const shouldMigrate = app_blockchain_version === "3" && wallet && !wallet.createdDateKin3;
	// XXX zero balance accounts don't need to migrate. We should check the balance of this account on kin2 prior to deciding

	res.status(200).send({
		should_migrate: shouldMigrate,
		app_blockchain_version,
		// restore allowed when no wallet was found or the appId is equal
		restore_allowed: !wallet || wallet.appId === appId,
	} as AccountMigrationStatus);
} as express.RequestHandler;
