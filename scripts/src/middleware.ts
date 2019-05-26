import * as express from "express";
import * as cluster from "cluster";
import * as httpContext from "express-http-context";
import * as moment from "moment";
import { performance } from "perf_hooks";
import { Request, Response } from "express-serve-static-core";

import * as metrics from "./metrics";
import { getConfig } from "./config";
import { generateId } from "./utils/utils";
import { MarketplaceError } from "./errors";
import { abort as restartServer } from "./server";
import { isAuthenticatedRequest } from "./public/auth";
import { getDefaultLogger as logger } from "./logging";

const START_TIME = (new Date()).toISOString();

const RESTART_ERROR_COUNT = 5;  // Amount of errors to occur in time frame to trigger restart
const RESTART_MAX_TIMEFRAME = 20;  // In seconds

export const CLIENT_SDK_VERSION_HEADER = "x-sdk-version";

let serverErrorTimeStamps: number[] = [];

function getAppIdFromRequest(req: Request): string {
	return isAuthenticatedRequest(req) ? req.context.user.appId : "";
}

/**
 * augments the request object with a request-id and a logger.
 * the logger should be then used when logging inside request handlers, which will then add some more info per logger
 */
export const requestLogger = function(req: express.Request, res: express.Response, next: express.NextFunction) {
	httpContext.set("reqId", req.header("x-request-id") || generateId());
	next();
} as express.RequestHandler;

function getWorkerId() {
	return cluster.worker ? cluster.worker.id : undefined;
}

export const logRequest = function(req: express.Request, res: express.Response, next: express.NextFunction) {
	const t = performance.now();
	const data = Object.assign({}, req.headers);

	if (req.query && Object.keys(req.query).length > 0) {
		data.querystring = req.query;
	}

	res.on("finish", () => {
		logger().debug(`worker ${ getWorkerId() }: finished handling request: ${ req.method } ${ req.path }`, { status: res.statusCode, data, time: performance.now() - t });
	});

	next();
} as express.RequestHandler;

export const setHttpContextFromRequest = function(req: express.Request, res: express.Response, next: express.NextFunction) {
	httpContext.set(CLIENT_SDK_VERSION_HEADER, req.header(CLIENT_SDK_VERSION_HEADER));
	next();
} as express.RequestHandler;

export const reportMetrics = function(req: express.Request, res: express.Response, next: express.NextFunction) {
	const t = performance.now();

	res.on("finish", () => {
		const path = req.route ? req.route.path : "unknown";
		metrics.timeRequest(performance.now() - t, req.method, path, getAppIdFromRequest(req));
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
	} else if (err.status && err.status < 500) {
		const mpErr = new MarketplaceError(err.status, 0, err.type || err.message, err.message);
		clientErrorHandler(mpErr, req as express.Request, res);
	} else {
		serverErrorHandler(err, req as express.Request, res);
	}
}

function clientErrorHandler(error: MarketplaceError, req: express.Request, res: express.Response) {
	logger().error(`client error (4xx)`, { error: error.toJson() });
	metrics.reportClientError(error, getAppIdFromRequest(req));

	// set headers from the error if any
	Object.keys(error.headers).forEach(key => res.setHeader(key, error.headers[key]));
	res.status(error.status).send(error.toJson());
}

function serverErrorHandler(error: any, req: express.Request, res: express.Response) {
	metrics.reportServerError(req.method, req.url, getAppIdFromRequest(req));

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
			restartServer("too many internal errors", getAppIdFromRequest(req));
		}
	}

	logger().error(`server error (5xx)`, { error: message });

	res.status(500).send({ code: 500, error: error.message || "Server error", message: error.message });
}

export const statusHandler = async function(req: express.Request, res: express.Response) {
	logger().info("status called", { context: isAuthenticatedRequest(req) ? req.context : null });
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
