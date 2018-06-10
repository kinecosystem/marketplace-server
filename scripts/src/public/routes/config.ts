import {  readKeysDir } from "../../utils";
import { getConfig } from "../config";
import { NextFunction, Request, RequestHandler, Response } from "express";
import { BlockchainConfig, getBlockchainConfig } from "../services/payment";
import { getDefaultLogger } from "../../logging";

const CONFIG = getConfig();
const KEYS = readKeysDir(CONFIG.jwt.public_keys_dir);
// one time get config from payment service
let BLOCKCHAIN: BlockchainConfig;
getBlockchainConfig(getDefaultLogger()).then(data => BLOCKCHAIN = data);

type ConfigResponse = {
	keys: { [name: string]: { algorithm: string, key: string } },
	blockchain: BlockchainConfig;
	bi_service: string;
};

export const getConfigHandler = async function(req: Request, res: Response, next: NextFunction) {
	const data: ConfigResponse = {
		keys: KEYS,
		blockchain: BLOCKCHAIN,
		bi_service: CONFIG.bi_service
	};
	res.status(200).send(data);
} as RequestHandler;
