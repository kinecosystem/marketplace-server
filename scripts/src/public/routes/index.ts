import * as express from "express";

import * as db from "../../models/users";
import { TOSMissingOrOldToken } from "../../errors";

import { authenticate } from "../auth";
import { statusHandler } from "../middleware";

import { getOffers } from "./offers";
import { getConfigHandler } from "./config";
import { signInUser, userExists, activateUser } from "./users";
import {
	getOrder,
	cancelOrder,
	getOrderHistory,
	submitOrder,
	changeOrder,
	createMarketplaceOrder,
	createExternalOrder
} from "./orders";

export type Context = {
	user: db.User | undefined;
	token: db.AuthToken | undefined;
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
	app.use(Router().get(createPath("config/", pathPrefix), getConfigHandler));

	app.use(Router().authenticated(/* no TOS scope */).get(createPath("offers/", pathPrefix), getOffers));

	app.use(Router().authenticated(AuthScopes.TOS).post(createPath("offers/external/orders", pathPrefix), createExternalOrder));
	app.use(Router().authenticated(AuthScopes.TOS).post(createPath("offers/:offer_id/orders", pathPrefix), createMarketplaceOrder));

	app.use(Router().authenticated(AuthScopes.TOS).get(createPath("orders/", pathPrefix), getOrderHistory));
	app.use(Router().authenticated(AuthScopes.TOS).get(createPath("orders/:order_id", pathPrefix), getOrder));
	app.use(Router().authenticated(AuthScopes.TOS).post(createPath("orders/:order_id", pathPrefix), submitOrder));
	app.use(Router().authenticated(AuthScopes.TOS).delete(createPath("orders/:order_id", pathPrefix), cancelOrder));
	app.use(Router().authenticated(AuthScopes.TOS).patch(createPath("orders/:order_id", pathPrefix), changeOrder));

	app.use(Router().post(createPath("users/", pathPrefix), signInUser));
	app.use(Router().authenticated(AuthScopes.TOS).get(createPath("users/exists", pathPrefix), userExists));
	app.use(Router().authenticated(/* no TOS scope */).post(createPath("users/me/activate", pathPrefix), activateUser));

	app.get("/status", statusHandler);
}

function createPath(path: string, prefix?: string): string {
	if (!prefix) {
		return path;
	}
	return `${ prefix }/${ path }`;
}
