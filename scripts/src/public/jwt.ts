import * as jsonwebtoken from "jsonwebtoken";

import { Application } from "../models/applications";

export type JWTClaims = {
	iss: string; // issuer - the app_id
	exp: number; // expiration
	iat: number; // issued at
	sub: string; // subject
};

export type JWTContent<T> = {
	header: {
		typ: string;
		alg: string;
		kid: string;
	};
	payload: JWTClaims & T;
	signature: string;
};

export async function verify<T>(token: string): Promise<JWTContent<T>> {
	const decoded = jsonwebtoken.decode(token, { complete: true }) as JWTContent<T>;
	const appId = decoded.payload.iss;
	const app = await Application.findOneById(appId);
	if (!app) {
		throw new Error(`app ${ appId } not found`);
	}

	const keyid = decoded.header.kid;
	const publicKey = app.jwtPublicKeys[keyid];
	if (!publicKey) {
		throw new Error(`keyid "${keyid}" not found for iss "${appId}"`);
	}
	jsonwebtoken.verify(token, publicKey); // throws

	return decoded;
}
