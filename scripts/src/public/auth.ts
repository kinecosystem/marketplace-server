import * as express from "express";
import * as httpContext from "express-http-context";

import { Mutable } from "../utils/utils";
import { AuthToken, User } from "../models/users";
import { MissingToken, InvalidToken, TOSMissingOrOldToken } from "../errors";

export type AuthContext = {
	readonly user: User;
	readonly token: AuthToken;
};

type TokenedRequest = express.Request & {
	readonly token: string;
};

export type AuthenticatedRequest = TokenedRequest & {
	readonly context: AuthContext;
};

function isTokenedRequest(req: express.Request): req is TokenedRequest {
	return (req as AuthenticatedRequest).token !== undefined;
}

export function isAuthenticatedRequest(req: express.Request): req is AuthenticatedRequest {
	return isTokenedRequest(req) && (req as AuthenticatedRequest).context !== undefined;
}

async function getTokenAndUser(req: express.Request): Promise<[AuthToken, User]> {
	if (!isTokenedRequest(req)) {
		throw MissingToken();
	}

	const token = await AuthToken.findOneById(req.token);
	if (!token || !token.valid || token.isExpired()) {
		throw InvalidToken(req.token);
	}

	const user = await User.findOneById(token.userId);
	httpContext.set("user", user);

	if (!user) {
		// This error now defines an inconsistent state in the DB where a token exists but not user is found
		// This should never happen as the token.user_id is a foreign key to the users table
		throw TOSMissingOrOldToken();
	}
	return [token, user];
}

export function setHttpContext(token: AuthToken, user: User) {
	httpContext.set("token", token);
	httpContext.set("user", user);

	// set userid, deviceid and appid for logging
	httpContext.set("userId", token.userId);
	httpContext.set("deviceId", token.deviceId);
	httpContext.set("appId", user.appId);
}

export const authenticateUser = async function(req: express.Request, res: express.Response, next: express.NextFunction) {
	const [token, user] = await getTokenAndUser(req);
	setHttpContext(token, user);

	(req as any as Mutable<AuthenticatedRequest>).context = {
		get user(): User {
			return httpContext.get("user");
		},
		get token(): AuthToken {
			return httpContext.get("token");
		}
	};
	next();
} as express.RequestHandler;
