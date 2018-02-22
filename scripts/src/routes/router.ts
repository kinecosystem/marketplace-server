import { Router, RequestHandler } from "express";

import { checkAuthentication } from "../auth";
import * as db from "../models/users";
import * as express from "express";

export type Context = {
	token: db.AuthToken;
	user: db.User;
};

// augment the express request object
declare module "express" {
	interface Request {
		token: string;
		context: Context;
	}
}

export type ExtendedRouter = Router & {
	authenticated(): Router;
};

const AUTHENTICATED_METHODS = ["get", "delete", "post", "put", "patch"];
export function create(): ExtendedRouter {
	const router = Router() as ExtendedRouter;

	router.authenticated = function() {
		return new Proxy(this, {
			get(target, name) {
				if (typeof name === "string" && AUTHENTICATED_METHODS.includes(name)) {
					return (path: string, handler: RequestHandler) => {
						return target[name](path, async (req: express.Request, res: express.Response, next: express.NextFunction) => {
							const token = await checkAuthentication(req);
							const user = await db.User.findOneById(token.userId);
							req.context = { user, token };

							return handler(req, res, next);
						});
					};
				}

				return target[name];
			},
		});
	};

	return router;
}
