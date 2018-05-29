import * as express from "express";

import * as db from "../../models/users";
import { TOSMissingOrOldToken } from "../../errors";

import { authenticate } from "../auth";

import { getOffers } from "./offers";
import { signInUser, activateUser } from "./users";
import {
	getOrder,
	cancelOrder,
	getOrderHistory,
	submitOrder,
	changeOrder,
	createMarketplaceOrder,
	createExternalOrder
} from "./orders";

import { statusHandler } from "../middleware";

export type Context = {
	token: db.AuthToken | undefined;
	user: db.User | undefined;
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

function Router(): ExtendedRouter {
	const router = express.Router() as ExtendedRouter;

	router.authenticated = function(...scopes: AuthScopes[]) {
		const proxy: ExtendedRouter = new Proxy(this, {
			get(target, name) {
				if (typeof name === "string" && AUTHENTICATED_METHODS.includes(name)) {
					return proxyOverRouter(router, proxy, (path: string, handler: express.RequestHandler) => {
						return (target as any)[name](path, async (req: express.Request, res: express.Response, next: express.NextFunction) => {
							const token = await authenticate(req);
							const user = await db.User.findOneById(token.userId);
							// XXX scopes should be per token and should not consider user data
							if (scopes.includes(AuthScopes.TOS) && (!user || !user.activated || token.createdDate < user.activatedDate!)) {
								throw TOSMissingOrOldToken();
							}
							req.context = { user, token };

							return handler(req, res, next);
						});
					});
				}

				return (target as any)[name];
			},
		});

		return proxy;
	};

	return router;
}

export function createRoutes(app: express.Express, pathPrefix?: string) {
	app.use(createPath("offers", pathPrefix),
		Router()
			.authenticated() // no TOS scope
			.get("/", getOffers));

	app.use(createPath("offers", pathPrefix),
		Router()
			.authenticated(AuthScopes.TOS)
			.post("/external/orders", createExternalOrder)
			.post("/:offer_id/orders", createMarketplaceOrder));

	app.use(createPath("orders", pathPrefix),
		Router()
			.authenticated(AuthScopes.TOS)
			.get("/", getOrderHistory)
			.get("/:order_id", getOrder)
			.post("/:order_id", submitOrder)
			.delete("/:order_id", cancelOrder)
			.patch("/:order_id", changeOrder));

	app.use(createPath("users", pathPrefix),
		Router()
			.post("/", signInUser)
			.authenticated() // no TOS scope
			.post("/me/activate", activateUser));

	app.get("/status", statusHandler);
}

function createPath(path: string, prefix?: string): string {
	if (!prefix) {
		return path;
	}

	return `${ prefix }/${ path }`;
}
