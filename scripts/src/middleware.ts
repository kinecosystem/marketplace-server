import * as db from "./models/users";
import * as express from "express";
import { getLogger } from "./logging";

const logger = getLogger();

export type Context = {
	authToken: db.AuthToken;
	user: db.User;
};

// add user context to request - from the auth token
export async function userContext(
	req: express.Request & { token: string, context: Context },
	res: express.Response, next: express.NextFunction) {

	logger.info("request path: " + req.path);

	if (req.path === "/v1/users") {
		next(); // no authentication
		return;
	}

	const authToken = await db.AuthToken.findOneById(req.token);
	if (!authToken) {
		throw new Error("unauthenticated"); // 403
	}
	const user = await db.User.findOneById(authToken.userId);
	if (!user) {
		throw new Error("incomplete user registration");
	}
	req.context = { user, authToken };
	next();
}
