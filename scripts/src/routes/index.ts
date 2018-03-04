import * as express from "express";

import * as db from "../models/users";
import { authenticate } from "../auth";
import { getOffers, createOrder } from "./offers";
import { getUser, signInUser, activateUser } from "./users";
import { getOrder, cancelOrder, getOrderHistory, submitEarn } from "./orders";
import { paymentComplete, paymentFailed } from "./internal";

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
	authenticated(): express.Router;
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

function router(): ExtendedRouter {
	const router = express.Router() as ExtendedRouter;

	router.authenticated = function() {
		const proxy = new Proxy(this, {
			get(target, name) {
				if (typeof name === "string" && AUTHENTICATED_METHODS.includes(name)) {
					return proxyOverRouter(router, proxy, (path: string, handler: express.RequestHandler) => {
						return target[name](path, async (req: express.Request, res: express.Response, next: express.NextFunction) => {
							const token = await authenticate(req);
							const user = await db.User.findOneById(token.userId);
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
			.authenticated()
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
			.authenticated()
			.post("/:order_id", submitEarn));
	app.use(createPath("orders", pathPrefix),
		router()
			.authenticated()
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

	// XXX should be in a separate executable
	app.use(createPath("internal", pathPrefix),
		router().post("/payments"), paymentComplete);

	app.use(createPath("internal", pathPrefix),
		router().post("/failed-payments"), paymentFailed);
}

function createPath(path: string, prefix?: string): string {
	if (!prefix) {
		return path;
	}

	return `${ prefix }/${ path }`;
}
