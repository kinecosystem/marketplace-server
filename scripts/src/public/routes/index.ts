import * as express from "express";

import * as db from "../../models/users";
import { authenticate } from "../auth";
import { getOffers } from "./offers";
import { getUser, signInUser, activateUser } from "./users";
import { getOrder, cancelOrder, getOrderHistory, submitOrder, createMarketplaceOrder, createExternalOrder } from "./orders";

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
								throw Error("user did not approve TOS or using a pre activated token");
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
	const router = Router();

	app.use(createPath("offers", pathPrefix),
		router
			.authenticated()
			.get("/", getOffers)
			.post("/external/orders", createExternalOrder)
			.post("/:offer_id/orders", createMarketplaceOrder));

	app.use(createPath("orders", pathPrefix),
		router
			.authenticated()
			.get("/", getOrderHistory)
			.get("/:order_id", getOrder));

	app.use(createPath("orders", pathPrefix),
		router
			.authenticated(AuthScopes.TOS)
			.post("/:order_id", submitOrder)
			.delete("/:order_id", cancelOrder));

	// XXX missing changeOrder to add error
	app.use(createPath("users", pathPrefix),
		router
			.get("/", getUser)
			.post("/", signInUser)
			.authenticated()
				.post("/me/activate", activateUser));
}

function createPath(path: string, prefix?: string): string {
	if (!prefix) {
		return path;
	}

	return `${ prefix }/${ path }`;
}
