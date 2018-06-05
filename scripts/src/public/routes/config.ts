import * as fs from "fs";
import { join } from "path";
import { path } from "../../utils";
import { getConfig } from "../config";
import { NextFunction, Request, RequestHandler, Response } from "express";

const CONFIG = getConfig();
const KEYS: {[name: string]: { algorithm: string, key: string }} = {};

(() => {
	fs.readdirSync(CONFIG.jwt.public_keys_dir).forEach(filename => {
		// filename format is kin-es256_0.pem
		const keyid = filename.split(".")[0];
		const algorithm = filename.split("_")[0].split("kin-")[1].toUpperCase();
		KEYS[keyid] =  {
			algorithm,
			key: fs.readFileSync(path(join(CONFIG.jwt.public_keys_dir, filename))).toString() };
	});
})();

export const getConfigHandler = async function (req: Request, res: Response, next: NextFunction) {
	const data = { keys: KEYS };
	res.status(200).send(data);
} as RequestHandler;
