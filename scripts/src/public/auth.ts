import * as express from "express";
import * as httpContext from "express-http-context";

import { dateParser, Mutable } from "../utils/utils";
import { AuthToken, User } from "../models/users";
import { getRedisClient } from "../redis";
type CachedTokenValue = { token: AuthToken, user: User };
import { Application } from "../models/applications";
import { MissingToken, InvalidToken, TOSMissingOrOldToken, NoSuchApp, WrongBlockchainVersion } from "../errors";
import { assertRateLimitUserRequests } from "../utils/rate_limit";

const tokenCacheTTL = 15 * 60; // 15 minutes

export type AuthContext = {
	readonly user: User;
	readonly token: AuthToken;
};

export type TokenedRequest = express.Request & {
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

	const redis = getRedisClient();
	const value = await redis.async.get(`token:${ req.token }`);
	if (value) {
		const cachedToken = JSON.parse(value, dateParser) as CachedTokenValue;
		return [AuthToken.new(cachedToken.token), User.new(cachedToken.user)];
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

	await redis.async.setex(`token:${ req.token }`, tokenCacheTTL, JSON.stringify({ token, user }));

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
	await assertRateLimitUserRequests(user);
	await throwOnMigrationError(req as AuthenticatedRequest);
	next();
} as express.RequestHandler;

async function throwOnMigrationError(req: AuthenticatedRequest) {
	const CLIENT_BLOCKCHAIN_HEADER = "x-kin-blockchain-version";
	const blockchainVersionHeader = req.header(CLIENT_BLOCKCHAIN_HEADER);

	const app = await Application.get(req.context.user.appId);
	if (!app) { // cached per instance
		throw NoSuchApp(req.context.user.appId);
	}

	const isAppMigrated = app.config.blockchain_version === "3";
	const isAppVersionEqualsToClient = app.config.blockchain_version === blockchainVersionHeader;

	if (isAppMigrated && !isAppVersionEqualsToClient) {
		throw WrongBlockchainVersion("Blockchain version not supported by SDK");
	}
}
