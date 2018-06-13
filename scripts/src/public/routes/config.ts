import { readKeysDir } from "../../utils";
import { getConfig } from "../config";
import { NextFunction, Request, RequestHandler, Response } from "express";
import { BlockchainConfig, getBlockchainConfig } from "../services/payment";
import { getDefaultLogger } from "../../logging";

const CONFIG = getConfig();
const JWT_KEYS = readKeysDir(CONFIG.jwt.public_keys_dir);
// one time get config from payment service
let BLOCKCHAIN: BlockchainConfig;
getBlockchainConfig(getDefaultLogger()).then(data => BLOCKCHAIN = data);

export type ConfigResponse = {
	jwt_keys: { [name: string]: { algorithm: string, key: string } },
	blockchain: BlockchainConfig;
	bi_service: string;
	webview: string;
	environment_name: string;
	ecosystem_service: string;
};

export const getConfigHandler = async function(req: Request, res: Response, next: NextFunction) {
	const data: ConfigResponse = {
		jwt_keys: JWT_KEYS,
		blockchain: BLOCKCHAIN,
		bi_service: CONFIG.bi_service,
		webview: CONFIG.webview,
		environment_name: CONFIG.environment_name,
		ecosystem_service: CONFIG.ecosystem_service
	};
	res.status(200).send(data);
} as RequestHandler;
