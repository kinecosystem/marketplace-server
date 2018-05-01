import { LoggerInstance } from "winston";
import * as jsonwebtoken from "jsonwebtoken";

import { isNothing } from "../utils";
import { Application } from "../models/applications";
import { NoSuchApp, NoSuchPublicKey, JwtKidMissing, WrongJWTAlgorithm } from "../errors";

export type JWTClaims = {
	iss: string; // issuer - the app_id
	exp: number; // expiration
	iat: number; // issued at
	sub: string; // subject
	kid?: string;
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
		// throw WrongJWTAlgorithm(decoded.header.alg);  // TODO uncomment when we deprecate other algo support
	}

	const appId = decoded.payload.iss;
	const app = await Application.findOneById(appId);
	if (!app) {
		throw NoSuchApp(appId);
	}

	const kid = decoded.header.kid || decoded.payload.kid;

	if (isNothing(kid)) {
		throw JwtKidMissing();
	}

	const publicKey = app.jwtPublicKeys[kid];
	if (!publicKey) {
		throw NoSuchPublicKey(appId, kid);
	}
	jsonwebtoken.verify(token, publicKey); // throws

	return decoded;
}
