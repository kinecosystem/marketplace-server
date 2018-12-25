import * as express from "express";

import * as db from "../models/users";
import { MissingToken, InvalidToken, TOSMissingOrOldToken } from "../errors";
import * as httpContext from "express-http-context";
import { AuthToken, User } from "../models/users";

async function getTokenAndUser(req: express.Request): Promise<[db.AuthToken, db.User]> {
	if (!req.token) {
		throw MissingToken();
	}

	const token = await db.AuthToken.findOneById(req.token);
	if (!token || !token.valid || token.isExpired()) {
		throw InvalidToken(req.token);
	}

	const user = await db.User.findOneById(token.userId);
	httpContext.set("user", user);

	if (!user) {
		// This error now defines an inconsistent state in the DB where a token exists but not user is found
		// This should never happen as the token.user_id is a foreign key to the users table
		throw TOSMissingOrOldToken();
	}
	return [token, user];
}

export const authenticateUser = async function(req: express.Request, res: express.Response, next: express.NextFunction) {
	const [token, user] = await getTokenAndUser(req);
	// set token, user for req.context
	httpContext.set("token", token);
	httpContext.set("user", user);

	// set userid, deviceid and appid for logging
	httpContext.set("userId", token.userId);
	httpContext.set("deviceId", token.deviceId);
	httpContext.set("appId", user.appId);

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
