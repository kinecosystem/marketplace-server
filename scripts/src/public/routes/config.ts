import { KeyMap } from "../../utils/utils";
import { getConfig } from "../config";
import { NextFunction, Request, RequestHandler, Response } from "express";
import {
	getAppBlockchainVersion as getAppBlockchainVersionService,
	setAppBlockchainVersion as setAppBlockchainVersionService
} from "../services/applications";
import { BlockchainConfig, getBlockchainConfig } from "../services/payment";
import { getDefaultLogger as log } from "../../logging";
import { getJwtKeys } from "../services/internal_service";

import { BlockchainVersion, BlockchainVersionValues } from "../../models/offers";

const CONFIG = getConfig();
let JWT_KEYS: KeyMap;
// one time get config from payment service
let BLOCKCHAIN: BlockchainConfig;
let BLOCKCHAIN3: BlockchainConfig;

export async function init() {
	BLOCKCHAIN = await getBlockchainConfig("2");
	BLOCKCHAIN3 = await getBlockchainConfig("3");
	JWT_KEYS = await getJwtKeys();
}

export type ConfigResponse = {
	jwt_keys: KeyMap,
	blockchain: BlockchainConfig;
	blockchain3: BlockchainConfig;
	bi_service: string;
	webview: string;
	environment_name: string;
	ecosystem_service: string;
};

export const getConfigHandler = async function(req: Request, res: Response, next: NextFunction) {
	const data: ConfigResponse = {
		jwt_keys: await getJwtKeys(),
		blockchain: await getBlockchainConfig("2"),
		blockchain3: await getBlockchainConfig("3"),
		bi_service: CONFIG.bi_service,
		webview: CONFIG.webview,
		environment_name: CONFIG.environment_name,
		ecosystem_service: CONFIG.ecosystem_service
	};
	res.status(200).send(data);
} as RequestHandler;

export type GetAppBlockchainVersionRequest = Request & {
	params: {
		app_id: string;
	};
};

export const getAppBlockchainVersion = async function(req: GetAppBlockchainVersionRequest, res: Response) {
	const app_id = req.params.app_id;
	const data = await getAppBlockchainVersionService(app_id);
	res.status(200).send(data);
} as any as RequestHandler;

// TODO: will be added soon. CONFIG.killswitch_via_api not added
// export type SetAppBlockchainVersionRequest = Request & {
// 	params: {
// 		app_id: string;
// 	};
// 	body: {
// 		blockchain_version: BlockchainVersion;
// 	}
// };

//  export const setAppBlockchainVersion = async function(req: SetAppBlockchainVersionRequest, res: Response) {
// 	if (CONFIG.killswitch_via_api === "true") {
// 		if (BlockchainVersionValues.indexOf(req.body.blockchain_version) >= 0) {
// 			const app_id = req.params.app_id;
// 			await setAppBlockchainVersionService(app_id, req.body.blockchain_version);
// 			res.status(200).send();
// 		} else {
// 			res.status(401).send();
// 		}
// 	} else {
// 		res.status(403).send();
// 	}
// } as any as RequestHandler;
