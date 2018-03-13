import * as express from "express";

import * as db from "../../models/users";
import { authenticate } from "../auth";
import { getOffers, createOrder } from "./offers";
import { getUser, signInUser, activateUser } from "./users";
import { getOrder, cancelOrder, getOrderHistory, submitOrder } from "./orders";

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

type ExtendedRouter = express.Router & {
	authenticated(...scopes: AuthScopes[]): express.Router;
};

function proxyOverRouter(router: express.Router, proxy: ExtendedRouter, obj: any): typeof obj {
	if (typeof obj === "function") {
		return function(...args: any[]) {
			const result = obj(...args);
			// const result = obj.apply(null, args);
			return result === router ? proxy : result;
		};
	}

	return obj === router ? proxy : obj;
}

const AUTHENTICATED_METHODS = ["get", "delete", "post", "put", "patch"];

enum AuthScopes { TOS }

function router(): ExtendedRouter {
	const router = express.Router() as ExtendedRouter;

	router.authenticated = function(...scopes: AuthScopes[]) {
		const proxy = new Proxy(this, {
			get(target, name) {
				if (typeof name === "string" && AUTHENTICATED_METHODS.includes(name)) {
					return proxyOverRouter(router, proxy, (path: string, handler: express.RequestHandler) => {
						return target[name](path, async (req: express.Request, res: express.Response, next: express.NextFunction) => {
							const token = await authenticate(req);
							const user = await db.User.findOneById(token.userId);
							// XXX scopes should be per token and should not consider user data
							if (scopes.includes(AuthScopes.TOS) && (!user.activated || token.createdDate < user.activatedDate)) {
								throw Error("user did not approve TOS or using a pre activated token");
							}
							req.context = { user, token };

							return handler(req, res, next);
						});
					});
				}

				return target[name];
			},
		});

		return proxy;
	};

	return router;
}

export function createRoutes(app: express.Express, pathPrefix?: string) {
	app.use(createPath("offers", pathPrefix),
		router()
			.authenticated()
			.get("/", getOffers));
	app.use(createPath("offers", pathPrefix),
		router()
			.authenticated(AuthScopes.TOS)
			.post("/:offer_id/orders", createOrder));

	app.use(createPath("orders", pathPrefix),
		router()
			.authenticated()
			.get("/", getOrderHistory));
	app.use(createPath("orders", pathPrefix),
		router()
			.authenticated()
			.get("/:order_id", getOrder));
	app.use(createPath("orders", pathPrefix),
		router()
			.authenticated(AuthScopes.TOS)
			.post("/:order_id", submitOrder));
	app.use(createPath("orders", pathPrefix),
		router()
			.authenticated(AuthScopes.TOS)
			.delete("/:order_id", cancelOrder));

	app.use(createPath("users", pathPrefix),
		router()
			.get("/", getUser));
	app.use(createPath("users", pathPrefix),
		router()
			.post("/", signInUser));
	app.use(createPath("users", pathPrefix),
		router()
			.authenticated()
			.post("/me/activate", activateUser));
}

function createPath(path: string, prefix?: string): string {
	if (!prefix) {
		return path;
	}

	return `${ prefix }/${ path }`;
}
