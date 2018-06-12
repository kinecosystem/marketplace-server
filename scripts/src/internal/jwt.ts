import * as moment from "moment";
import * as jsonwebtoken from "jsonwebtoken";
import { readKeysDir } from "../utils";
import { getConfig } from "./config";

const CONFIG = getConfig();
const KEYS = readKeysDir(CONFIG.jwt.private_keys_dir);

export function sign(subject: string, payload: any, keyid?: string) {
	if (!keyid) {
			keyid = "es256_0";  // TODO the key should be randomly chosen or timely rotated
	}
	const signWith = KEYS[keyid];
	return jsonwebtoken.sign(payload, signWith.key, {
		subject,
		keyid,
		issuer: "kin",
		algorithm: signWith.algorithm,
		expiresIn: moment().add(6, "hours").valueOf()
	});
}
