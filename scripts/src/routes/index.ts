import * as express from "express";

import * as db from "../models/users";
import { authenticate } from "../auth";
import { init as initOffers, getOffers, createOrder } from "./offers";
import { init as initUsers, getUser, signinUser, activateUser } from "./users";
import { init as initOrders, getOrder, cancelOrder, getOrderHistory, submitEarn } from "./orders";

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

const AUTHENTICATED_METHODS = ["get", "delete", "post", "put", "patch"];
function router(): ExtendedRouter {
	const router = express.Router() as ExtendedRouter;

	router.authenticated = function() {
		return new Proxy(this, {
			get(target, name) {
				if (typeof name === "string" && AUTHENTICATED_METHODS.includes(name)) {
					return (path: string, handler: express.RequestHandler) => {
						return target[name](path, async (req: express.Request, res: express.Response, next: express.NextFunction) => {
							const token = await authenticate(req);
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

export function createRoutes(app: express.Express, pathPrefix?: string) {
	initOffers();
	app.use(createPath("offers", pathPrefix),
		router()
			.authenticated()
				.get("/", getOffers)
				.post("/:offer_id/orders", createOrder));

	initOrders();
	app.use(createPath("orders", pathPrefix),
		router()
			.authenticated()
				.get("/", getOrderHistory)
				.get("/:order_id", getOrder)
				.post("/:order_id", submitEarn)
				.delete("/:order_id", cancelOrder));

	initUsers();
	app.use(createPath("users", pathPrefix),
		router()
			.get("/", getUser)
			.authenticated()
				.post("/", signinUser)
				.post("/me/activate", activateUser));
}

function createPath(path: string, prefix?: string): string {
	if (!prefix) {
		return path;
	}

	return `${ prefix }/${ path }`;
}
