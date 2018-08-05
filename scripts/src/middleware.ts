import * as express from "express";
import * as moment from "moment";
import { performance } from "perf_hooks";
import { LoggerInstance } from "winston";
import { Request, Response } from "express-serve-static-core";

import * as metrics from "./metrics";
import { getConfig } from "./config";
import { generateId, pick } from "./utils";
import { MarketplaceError } from "./errors";
import { getDefaultLogger } from "./logging";
import { abort as restartServer } from "./server";

const START_TIME = (new Date()).toISOString();

const RESTART_ERROR_COUNT = 5;  // Amount of errors to occur in time frame to trigger restart
const RESTART_MAX_TIMEFRAME = 20;  // In seconds
let serverErrorTimeStamps: number[] = [];

let logger: LoggerInstance;

export function init() {
	logger = getDefaultLogger();
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
export const requestLogger = function(req: express.Request, res: express.Response, next: express.NextFunction) {
	const methods = ["debug", "info", "warn", "error"];
	const id = generateId();
	const proxy = new Proxy(logger, {
		get(target, name: keyof LoggerInstance) {
			if (typeof name === "string" && methods.includes(name)) {
				return function(...args: any[]) {
					if (typeof args[args.length - 1] === "object") {
						args[args.length - 1] = Object.assign({}, args[args.length - 1], { reqId: id });
					} else {
						args = [...args, { reqId: id }];
					}

					(target[name] as (...args: any[]) => void)(...args);
				};
			}

			return target[name];
		}
	});

	// id & logger are readonly and so cannot be assigned, unless cast to any
	(req as any).id = id;
	(req as any).logger = proxy;
	next();
} as express.RequestHandler;

export const logRequest = function(req: express.Request, res: express.Response, next: express.NextFunction) {
	const t = performance.now();
	const data = Object.assign({}, req.headers);

	if (req.query && Object.keys(req.query).length > 0) {
		data.querystring = req.query;
	}

	req.logger.info(`start handling request ${ req.id }: ${ req.method } ${ req.path }`, data);

	res.on("finish", () => {
		req.logger.info(`finished handling request ${ req.id }`, { time: performance.now() - t });
	});

	next();
} as express.RequestHandler;

export const reportMetrics = function(req: express.Request, res: express.Response, next: express.NextFunction) {
	const t = performance.now();

	res.on("finish", () => {
		const path = req.route ? req.route.path : (req.url || "unknown");
		metrics.timeRequest(performance.now() - t, req.method, path);
	});

	next();
} as express.RequestHandler;

export const notFoundHandler = function(req: Request, res: Response) {
	res.status(404).send({ code: 404, error: "Not found", message: "Not found" });
} as express.RequestHandler;

/**
 * The "next" arg is needed even though it's not used, otherwise express won't understand that it's an error handler
 */
export function generalErrorHandler(err: any, req: Request, res: Response, next: express.NextFunction) {
	if (err instanceof MarketplaceError) {
		clientErrorHandler(err, req as express.Request, res);
	} else {
		serverErrorHandler(err, req as express.Request, res);
	}
}

function clientErrorHandler(error: MarketplaceError, req: express.Request, res: express.Response) {
	const log = req.logger || logger;

	log.error(`client error (4xx)`, error);
	metrics.reportClientError(error, pick(req.headers as any,
		"x-os",
		"x-sdk-version",
		"x-device-model",
		"x-device-manufacturer"));
	// set headers from the error if any
	Object.keys(error.headers).forEach(key => res.setHeader(key, error.headers[key]));
	res.status(error.status).send(error.toJson());
}

function serverErrorHandler(error: any, req: express.Request, res: express.Response) {
	const log = req.logger || logger;
	metrics.reportServerError(req.method, req.url);

	const timestamp = moment().unix();
	serverErrorTimeStamps.push(timestamp);
	serverErrorTimeStamps = serverErrorTimeStamps.slice(-RESTART_ERROR_COUNT);

	let message = `Error
	method: ${ req.method }
	path: ${ req.url }
	payload: ${ JSON.stringify(req.body) }
	`;

	if (error instanceof Error) {
		message += `message: ${ error.message }
	stack: ${ error.stack }`;
	} else {
		message += `message: ${ error.toString() }`;
	}

	if (serverErrorTimeStamps.length === RESTART_ERROR_COUNT) {
		if (timestamp - serverErrorTimeStamps[0] < RESTART_MAX_TIMEFRAME) {
			restartServer("too many internal errors");
		}
	}

	log.error(`server error (5xx)`, message);

	res.status(500).send({ code: 500, error: error.message || "Server error", message: error.message });
}

export const statusHandler = async function(req: express.Request, res: express.Response) {
	res.status(200).send(
		{
			status: "ok",
			app_name: getConfig().app_name,
			start_time: START_TIME,
			build: {
				commit: getConfig().commit,
				timestamp: getConfig().timestamp,
			}
		});
} as any as express.RequestHandler;
