import * as db from "../models/users";
import { MissingToken, InvalidToken, TOSMissingOrOldToken } from "../errors";
import { getRedisClient } from "../redis";

export async function authenticate(token: string): Promise<db.AuthToken> {
	if (!token) {
		throw MissingToken();
	}

	const authToken = await db.AuthToken.findOneById(token);
	if (!authToken) {
		throw InvalidToken(token);
	}

	return authToken;
}

export async function authenticateAndGetUser(token: string): Promise<[db.AuthToken, db.User]> {
	const redis = getRedisClient();
	const key = `token:${token}`;
	const data = await redis.async.get(key);
	let authToken: db.AuthToken;
	let user: db.User;

	if (data) {
		[authToken, user] = JSON.parse(data);
	} else {
		authToken = await authenticate(token);
		user = (await db.User.findOneById(authToken.userId))!;
		if (!user) {
			// This error now defines an inconsistent state in the DB where a token exists but not user is found
			// This should never happen as the token.user_id is a foreign key to the users table
			throw TOSMissingOrOldToken();
		}

		await redis.async.set(key, JSON.stringify([authToken, user]));
	}

	return [authToken, user];
}
