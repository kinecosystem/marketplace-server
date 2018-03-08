import * as express from "express";
import { LoggerInstance } from "winston";
import * as bearerToken from "express-bearer-token";

import { getDefaultLogger } from "./logging";
import { generateId } from "./utils";

let logger: LoggerInstance;
export function init(app: express.Express) {
	logger = getDefaultLogger();

	app.use(requestLogger);
	app.use(bearerToken());
	app.use(logRequest);
}

declare module "express" {
	interface Request {
		readonly id: string;
		readonly logger: LoggerInstance;
	}
}

/**
 * augments the request object with a request-id and a logger.
 * the logger should be then used when logging inside request handlers, which will then add some more info per log
 */
function requestLogger(req: express.Request, res, next) {
	const methods = ["debug", "info", "warn", "error"];
	const id = generateId();
	const proxy = new Proxy(logger, {
		get(target, name) {
			if (typeof name === "string" && methods.includes(name)) {
				return function(...args: any[]) {
					if (typeof args[args.length - 1] === "object") {
						args[args.length - 1] = Object.assign({}, args[args.length - 1], { reqId: id });
					} else {
						args = [...args, { reqId: id }];
					}

					target[name](...args);
				};
			}

			return target[name];
		}
	});

	// id & logger are readonly and so cannot be assigned, unless cast to any
	(req as any).id = id;
	(req as any).logger = proxy;
	next();
}

function logRequest(req: express.Request, res, next) {
	const start = new Date();
	req.logger.info(`start handling request ${ req.id }: ${ req.method } ${ req.path }`, req.headers);

	res.on("finish", () => {
		req.logger.info(`finished handling request ${ req.id }`, { start: start.getTime(), end: new Date().getTime() });
	});

	next();
}

export function notFoundHandler(req: express.Request, res: express.Response) {
	// log.error(`Error 404 on ${req.url}.`);
	res.status(404).send({ status: 404, error: "Not found" });
}

export type ApiError = {
	status: number;
	error: string;
};

/**
 * The "next" arg is needed even though it's not used, otherwise express won't understand that it's an error handler
 */
export function generalErrorHandler(err: any, req: express.Request, res: express.Response, next) {
	let message = `Error
	method: ${ req.method }
	path: ${ req.url }
	payload: ${ JSON.stringify(req.body) }
	`;

	if (err instanceof Error) {
		message += `message: ${ err.message }
	stack: ${ err.stack }`;
	} else {
		message += `message: ${ err.toString() }`;
	}

	logger.error(message);
	res.status(500).send({ status: 500, error: err.message || "Server error" });
}
