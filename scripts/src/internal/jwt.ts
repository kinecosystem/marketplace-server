import * as moment from "moment";
import * as jsonwebtoken from "jsonwebtoken";
import { readKeysDir } from "../utils";
import { getConfig } from "./config";

const CONFIG = getConfig();
const KEYS = readKeysDir(CONFIG.jwt.private_keys_dir);

function getKeyForAlgorithm(alg: string): string {
	let keyid: string | undefined;
	for (const currKeyid of Object.keys(KEYS)) {
		if (KEYS[currKeyid].algorithm.toUpperCase() === alg.toUpperCase()) {
			keyid = currKeyid;
		}
	}
	if (!keyid) {
		throw Error(`key not found for algorithm ${alg}`);
	}
	return keyid;
}

export function sign(subject: string, payload: any, alg?: string) {
	const keyid = getKeyForAlgorithm(alg || "es256");
	const signWith = KEYS[keyid];
	return jsonwebtoken.sign(payload, signWith.key, {
		subject,
		keyid,
		issuer: "kin",
		algorithm: signWith.algorithm,
		expiresIn: moment().add(6, "hours").unix()
	});
}
