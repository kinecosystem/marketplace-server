import { KeyMap } from "../../utils/utils";
import { getConfig } from "../config";
import { NextFunction, Request, RequestHandler, Response } from "express";
import { BlockchainConfig, getBlockchainConfig } from "../services/payment";
import { getDefaultLogger as log } from "../../logging";
import { getJwtKeys } from "../services/internal_service";

const CONFIG = getConfig();
let JWT_KEYS: KeyMap;
// one time get config from payment service
let BLOCKCHAIN: BlockchainConfig;

export async function init() {
	BLOCKCHAIN = await getBlockchainConfig(log());
	JWT_KEYS = await getJwtKeys();
}

export type ConfigResponse = {
	jwt_keys: KeyMap,
	blockchain: BlockchainConfig;
	bi_service: string;
	webview: string;
	environment_name: string;
	ecosystem_service: string;
};

export const getConfigHandler = async function(req: Request, res: Response, next: NextFunction) {
	const data: ConfigResponse = {
		jwt_keys: await getJwtKeys(),
		blockchain: await getBlockchainConfig(log()),
		bi_service: CONFIG.bi_service,
		webview: CONFIG.webview,
		environment_name: CONFIG.environment_name,
		ecosystem_service: CONFIG.ecosystem_service
	};
	res.status(200).send(data);
} as RequestHandler;
