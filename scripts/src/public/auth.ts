import * as express from "express";
import * as httpContext from "express-http-context";
import { dateParser, isNothing, Mutable } from "../utils/utils";
import { AuthToken, GradualMigrationUser, User, WalletApplication } from "../models/users";
import { getRedisClient } from "../redis";
import { Application } from "../models/applications";
import { MissingToken, InvalidToken, TOSMissingOrOldToken, NoSuchApp, WrongBlockchainVersion } from "../errors";
import { assertRateLimitUserRequests } from "../utils/rate_limit";
import { withinMigrationRateLimit } from "../utils/migration";
import moment = require("moment");

const tokenCacheTTL = 15 * 60; // 15 minutes
type CachedTokenValue = { token: AuthToken, user: User };

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

	// allow PATCH /v2/users/me without migration check
	// this allows a user on kin2 to complete the KIN.login method on the client
	// and only after that start migration (throwing this error during login kills the client)
	if (!req.url.startsWith("/v2/users/me")) {
		if (await checkMigrationNeeded(req as AuthenticatedRequest)) {
			throw WrongBlockchainVersion("Blockchain version not supported by SDK");
		}
	}
	next();
} as express.RequestHandler;

async function checkMigrationNeeded(req: AuthenticatedRequest): Promise<boolean> {
	const CLIENT_BLOCKCHAIN_HEADER = "x-kin-blockchain-version";
	const blockchainVersionHeader = req.header(CLIENT_BLOCKCHAIN_HEADER);
	const user = req.context.user;
	const deviceId = req.context.token.deviceId;

	if (blockchainVersionHeader === "3") {
		return false; // TODO should we make assertions that the current wallet is on kin3?
	}
	const app = await Application.get(user.appId);
	if (!app) { // cached per instance
		throw NoSuchApp(user.appId);
	}
	if (app.config.blockchain_version === "3") {
		return true;
	}
	if (app.applyGradualMigration()) {
		const wallet = (await user.getWallets(deviceId)).lastUsed() ||
			(await user.getWallets()).lastUsed();
		if (!wallet) {
			// :( TODO shouldn't happen - log this
			return false;
		}
		const walletApplication = await WalletApplication.findOne({ walletAddress: wallet.address });
		if (walletApplication && walletApplication.createdDateKin3) {
			return true;
		}
		const whitelist = await GradualMigrationUser.findOneById(user.id);
		if (whitelist && (whitelist.migrationDate || withinMigrationRateLimit(app.id))) {
			await GradualMigrationUser.setAsMigrated([user.id]);
			return true;
		}
	}

	return false;
}
