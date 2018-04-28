import * as jsonwebtoken from "jsonwebtoken";
import { Application } from "../models/applications";
import { LoggerInstance } from "winston";

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

export async function verify<T>(token: string, logger: LoggerInstance): Promise<JWTContent<T>> {
	const decoded = jsonwebtoken.decode(token, { complete: true }) as JWTContent<T>;
	if (decoded.header.alg.toUpperCase() !== "ES256") {
		logger.warn(`got JWT with wrong algorithm ${decoded.header.alg}. ignoring`);
		// throw new Error(`only ES256 supported`);
	}

	const appId = decoded.payload.iss;
	const app = await Application.findOneById(appId);
	if (!app) {
		throw new Error(`app ${ appId } not found`);
	}

	const kid = decoded.header.kid;
	const publicKey = app.jwtPublicKeys[kid];
	if (!publicKey) {
		throw new Error(`kid "${ kid }" not found for jwt "${ decoded }"`);
	}
	jsonwebtoken.verify(token, publicKey); // throws

	return decoded;
}
