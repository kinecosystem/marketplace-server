import * as moment from "moment";
import { getDefaultLogger as logger } from "../logging";
import * as jsonwebtoken from "jsonwebtoken";

import { isNothing } from "../utils/utils";
import { Application } from "../models/applications";
import {
	BadJWTInput,
	InvalidJwtIssuedTime,
	InvalidJwtSignature,
	JwtKidMissing,
	NoSuchApp,
	NoSuchPublicKey
} from "../errors";

export type JWTClaims<SUB extends string> = {
	iss: string; // issuer - the app_id
	exp: number; // expiration
	iat: number; // issued at
	sub: SUB; // subject
};

export type JWTContent<T, SUB extends string> = {
	header: {
		typ: string;
		alg: string;
		kid: string;
	};
	payload: JWTClaims<SUB> & T;
	signature: string;
};

const asyncJwtVerify =
	(token: string, publicKey: string, options: object): Promise<object | string> => new Promise(
		(res, rej) => {
			jsonwebtoken.verify(token, publicKey, options, (err, decoded) => {
				if (err || !decoded) {
					rej(err);
				} else {
					res(decoded);
				}
			});
		});

export async function verify<T, SUB extends string>(token: string): Promise<JWTContent<T, SUB>> {
	const decoded = jsonwebtoken.decode(token, { complete: true }) as JWTContent<T, SUB> | null;
	if (isNothing(decoded)) {
		throw BadJWTInput(token);
	}
	if (decoded.header.alg.toUpperCase() !== "ES256") {
		logger().warn(`got JWT with wrong algorithm ${ decoded.header.alg }. ignoring`);
		// throw WrongJWTAlgorithm(decoded.header.alg);  // TODO uncomment when we deprecate other algo support
	}

	const now = moment();
	if (now.isBefore(moment.unix(decoded.payload.iat))) {
		throw InvalidJwtIssuedTime(decoded.payload.iat);
	}

	// if (now.isAfter(moment.unix(decoded.payload.exp))) {
	// 	throw ExpiredJwt(decoded.payload.exp);
	// }

	const appId = decoded.payload.iss;
	const app = await Application.findOneById(appId);
	if (!app) {
		throw NoSuchApp(appId);
	}

	const kid = decoded.header.kid;
	if (isNothing(kid)) {
		throw JwtKidMissing();
	}

	const publicKey = app.jwtPublicKeys[kid];
	if (!publicKey) {
		throw NoSuchPublicKey(appId, kid);
	}

	try {
		await asyncJwtVerify(token, publicKey, { ignoreExpiration: true }); // throws
	} catch (e) {
		throw InvalidJwtSignature();
	}

	return decoded;
}
