import * as express from "express";
import { LoggerInstance } from "winston";
import * as bearerToken from "express-bearer-token";

// import * as db from "./models/users";
import { getLogger } from "./logging";

let logger: LoggerInstance;

export function init(app: express.Express) {
	logger = getLogger();

	app.use(bearerToken());
	app.use(logRequest);
	// app.use(userContext);
}

export function logRequest(req, res, next) {
	logger.info(`start handling request: ${ req.path }`);
	next();
}

/*export type Context = {
	authToken: db.AuthToken;
	user: db.User;
};

// augment the express request
declare module "express" {
	interface Request {
		token: string;
		context: Context;
	}
}

// add user context to request - from the auth token
export async function userContext(req: express.Request, res: express.Response, next: express.NextFunction) {
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
}*/
