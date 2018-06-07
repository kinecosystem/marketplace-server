import {  readKeysDir } from "../../utils";
import { getConfig } from "../config";
import { NextFunction, Request, RequestHandler, Response } from "express";

const CONFIG = getConfig();
const KEYS = readKeysDir(CONFIG.jwt.public_keys_dir);

export const getConfigHandler = async function(req: Request, res: Response, next: NextFunction) {
	const data = { keys: KEYS };
	res.status(200).send(data);
} as RequestHandler;
