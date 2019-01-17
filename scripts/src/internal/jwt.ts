import * as moment from "moment";
import * as jsonwebtoken from "jsonwebtoken";
import { readKeysDir } from "../utils/utils";
import { getConfig } from "./config";
import * as path from "path";

const CONFIG = getConfig();
const PRIVATE_KEYS = readKeysDir(path.join(CONFIG.jwt_keys_dir, "private_keys"));
export const PUBLIC_KEYS = readKeysDir(path.join(CONFIG.jwt_keys_dir, "public_keys"));

const asyncJwtSign =
	(payload: object, secretKey: string, options: object): Promise<string> => new Promise(
		(res, rej) => {
			jsonwebtoken.sign(payload, secretKey, options, (err, token) => {
				if (err) {
					rej(err);
				} else {
					res(token);
				}
			});
		});

function getKeyForAlgorithm(alg: string): string {
	const keyid = Object.keys(PRIVATE_KEYS).find(k => PRIVATE_KEYS[k].algorithm.toUpperCase() === alg.toUpperCase());
	if (!keyid) {
		throw Error(`key not found for algorithm ${alg}`);
	}
	return keyid;
}

export async function sign(subject: string, payload: object, alg?: string): Promise<string>{
	const keyid = getKeyForAlgorithm(alg || "es256");
	const signWith = PRIVATE_KEYS[keyid];
	return await asyncJwtSign(payload, signWith.key, {
		subject,
		keyid,
		issuer: "kin",
		algorithm: signWith.algorithm,
		expiresIn: moment().add(6, "hours").unix()
	});
}
