import * as express from "express";
import { BlockchainVersion } from "../../models/offers";
import { getAppBlockchainVersion } from "./applications";
import { getConfig } from "../config";

import axios from "axios";
import { getDefaultLogger as logger } from "../../logging";

const axiosRetry = require("axios-retry"); // TODO: this fails the tests: import axiosRetry from "axios-retry";

const DEFAULT_TIMEOUT = 300;

const client = axios.create({ timeout: DEFAULT_TIMEOUT });
axiosRetry(client, { retries: 6, retryCondition: () => true, shouldResetTimeout: true });

type AccountMigrationStatus = {
	should_migrate: boolean;
	app_blockchain_version: BlockchainVersion
};

export const accountStatus = async function(req: express.Request, res: express.Response) {
	logger().info(`handling account status request app_id: ${ req.params.app_id } public_address: ${ req.params.public_address }`);

	const app_blockchain_version = await getAppBlockchainVersion(req.params.app_id);

	const isBurnedRes = await client.get(`${ getConfig().migration_service }/accounts/${ req.params.public_address }/status`);

	const shouldMigrate = app_blockchain_version === "3" && !(isBurnedRes.data.is_burned);

	res.status(200).send({
		should_migrate: shouldMigrate,
		app_blockchain_version,
	} as AccountMigrationStatus);
} as express.RequestHandler;
