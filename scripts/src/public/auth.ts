import * as express from "express";

import * as db from "../models/users";
import { MissingToken, InvalidToken } from "../errors";

export async function authenticate(req: express.Request): Promise<db.AuthToken> {
	if (!req.token) {
		throw MissingToken();
	}

	const token = await db.AuthToken.findOne(req.token);
	if (!token) {
		throw InvalidToken(req.token);
	}

	return token;
}
