import * as express from "express";

import * as db from "./models/users";

export async function authenticate(req: express.Request): Promise<db.AuthToken> {
	if (!req.token) {
		throw new Error("request missing token");
	}

	const token = await db.AuthToken.findOneById(req.token);
	if (!token) {
		throw new Error(`token not found for ${ req.token }`);
	}

	return token;
}
