import * as moment from "moment";
import { readFileSync } from "fs";
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

export function sign(subject: string, payload: any) {
	const signWith = KEYS.random();

	payload = Object.assign({
		typ: "JWT"
	}, payload);

	return jsonwebtoken.sign(payload, signWith.key, {
		subject,
		keyid: signWith.id,
		algorithm: signWith.algorithm,
		expiresIn: moment().add(6, "hours").valueOf()
	});
}

// init
(() => {
	Object.entries(CONFIG.jwt.private_keys).forEach(([ name, key ]) => {
		KEYS.set(name, { algorithm: key.algorithm, key: readFileSync(path(key.file)) });
	});
})();
