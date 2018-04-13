import * as jsonwebtoken from "jsonwebtoken";

import { Application } from "../models/applications";

export type JWTClaims = {
	iss: string; // issuer
	exp: number; // expiration
	iat: number; // issued at
	sub: string; // subject
};

export type JWTContent<T> = {
	header: {
		typ: string;
		alg: string;
		key: string;
	};
	payload: JWTClaims & T;
	signature: string;
};

export async function verify<T>(token: string): Promise<JWTContent<T>> {
	const decoded = jsonwebtoken.decode(token, { complete: true }) as JWTContent<T>;
	const app = await Application.findOne(decoded.payload.iss);
	if (!app) {
		throw new Error(`app ${ decoded.payload.iss } not found`);
	}

	const publicKey = app.jwtPublicKeys[decoded.header.key];
	jsonwebtoken.verify(token, publicKey); // throws

	return decoded;
}
