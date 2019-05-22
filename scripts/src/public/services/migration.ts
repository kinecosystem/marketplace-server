import * as express from "express";
import { BlockchainVersion } from "../../models/offers";
import { getAppBlockchainVersion } from "./applications";
import { WalletApplication } from "../../models/users";
import { getConfig } from "../config";
import { NoSuchWallet } from "../../errors";

import { getDefaultLogger as logger } from "../../logging";
import { isRestoreAllowed } from "./users";

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
	if (!wallet) {
		throw NoSuchWallet(publicAddress);
	}

	const shouldMigrate = app_blockchain_version === "3" && !wallet.createdDateKin3; // no date for kin3 says it is kin2 and should migrate

	res.status(200).send({
		should_migrate: shouldMigrate,
		app_blockchain_version,
		restore_allowed: await isRestoreAllowed(publicAddress, appId, false),
	} as AccountMigrationStatus);
} as express.RequestHandler;
