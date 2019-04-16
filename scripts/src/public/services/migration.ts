import * as express from "express";
import { BlockchainVersion } from "../../models/offers";
import { getAppBlockchainVersion } from "./applications";
import { getConfig } from "../config";

import axios from "axios";
import { getDefaultLogger as logger } from "../../logging";
import { isRestoreAllowed } from "./users";

const axiosRetry = require("axios-retry"); // TODO: this fails the tests: import axiosRetry from "axios-retry";

const DEFAULT_TIMEOUT = 300;

const client = axios.create({ timeout: DEFAULT_TIMEOUT });
axiosRetry(client, { retries: 6, shouldResetTimeout: true });

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

	const isBurnedRes = await client.get(`${ getConfig().migration_service }/accounts/${ publicAddress }/status`, {
		validateStatus: status => {
			return status < 500; // Reject only if the status code is greater than or equal to 500
		}
	});
	if (isBurnedRes.status === 404) {
		isBurnedRes.data.is_burned = true; // Wallet doesn't exist
	} else if (isBurnedRes.status > 400) {
		logger().info(`Something went wrong, migration service response`, isBurnedRes);
		throw Error(`Something went wrong, migration service response: ${ JSON.stringify(isBurnedRes.data) }`);
	}
	const shouldMigrate = app_blockchain_version === "3" && !(isBurnedRes.data.is_burned);

	res.status(200).send({
		should_migrate: shouldMigrate,
		app_blockchain_version,
		restore_allowed: await isRestoreAllowed(publicAddress, appId, false),
	} as AccountMigrationStatus);
} as express.RequestHandler;
