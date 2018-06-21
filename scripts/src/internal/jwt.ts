import * as moment from "moment";
import * as jsonwebtoken from "jsonwebtoken";
import { readKeysDir } from "../utils";
import { getConfig } from "./config";

const CONFIG = getConfig();
const PRIVATE_KEYS = readKeysDir(CONFIG.jwt.private_keys_dir);
export const PUBLIC_KEYS = readKeysDir(CONFIG.jwt.public_keys_dir);

function getKeyForAlgorithm(alg: string): string {
	const keyid = Object.keys(PRIVATE_KEYS).find(k => PRIVATE_KEYS[k].algorithm.toUpperCase() === alg.toUpperCase());
	if (!keyid) {
		throw Error(`key not found for algorithm ${alg}`);
	}
	return keyid;
}

export function sign(subject: string, payload: any, alg?: string) {
	const keyid = getKeyForAlgorithm(alg || "es256");
	const signWith = PRIVATE_KEYS[keyid];
	return jsonwebtoken.sign(payload, signWith.key, {
		subject,
		keyid,
		issuer: "kin",
		algorithm: signWith.algorithm,
		expiresIn: moment().add(6, "hours").unix()
	});
}
