import * as express from "express";

import * as db from "../models/users";
import { MissingToken, InvalidToken, TOSMissingOrOldToken } from "../errors";
import * as httpContext from "express-http-context";
import { AuthToken, User } from "../models/users";

export async function authenticate(req: express.Request): Promise<db.AuthToken> {
	if (!req.token) {
		throw MissingToken();
	}

	const token = await db.AuthToken.findOneById(req.token);
	if (!token) {
		throw InvalidToken(req.token);
	}

	return token;
}

export const authenticateUser = async function(req: express.Request, res: express.Response, next: express.NextFunction) {
	const token = await authenticate(req);
	httpContext.set("userId", token.userId);
	httpContext.set("deviceId", token.deviceId);
	httpContext.set("token", token);

	const user = await db.User.findOneById(token.userId);
	httpContext.set("user", user);

	if (!user) {
		// This error now defines an inconsistent state in the DB where a token exists but not user is found
		// This should never happen as the token.user_id is a foreign key to the users table
		throw TOSMissingOrOldToken();
	}

	req.context = {
		get user(): User {
			return httpContext.get("user");
		},
		get token(): AuthToken {
			return httpContext.get("token");
		}
	};
	next();
} as express.RequestHandler;
