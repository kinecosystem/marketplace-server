import * as moment from "moment";
import * as fs from "fs";
import { join } from "path";
import * as jsonwebtoken from "jsonwebtoken";
import { path } from "../utils";
import { getConfig } from "./config";

const CONFIG = getConfig();

class KeyMap extends Map<string, { algorithm: string; key: Buffer; }> {
	public random() {
		const entries = Array.from(this.entries()).map(([id, key]) => ({
			id,
			key: key.key,
			algorithm: key.algorithm
		}));

		return entries[Math.floor(Math.random() * entries.length)];
	}
}

const KEYS = new KeyMap();

export function sign(subject: string, payload: any, keyid?: string) {
	if (!keyid) {
			keyid = "kin-es256_0";  // TODO the key should be randomly chosen or timely rotated
	}
	const signWith = KEYS.get(keyid)!;
	return jsonwebtoken.sign(payload, signWith.key, {
		subject,
		keyid,
		issuer: "kin",
		algorithm: signWith.algorithm,
		expiresIn: moment().add(6, "hours").valueOf()
	});
}

// init
(() => {
	fs.readdirSync(CONFIG.jwt.private_keys_dir).forEach(filename => {
		// filename format is kin-es256_0-priv.pem
		const keyid = filename.split("-priv.")[0];
		const algorithm = filename.split("_")[0].replace(/kin-/, "").toUpperCase();
		KEYS.set(keyid, { algorithm, key: fs.readFileSync(path(join(CONFIG.jwt.private_keys_dir, filename))) });
	});
})();
