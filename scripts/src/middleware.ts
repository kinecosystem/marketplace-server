import * as express from "express";
import { LoggerInstance } from "winston";
import * as bearerToken from "express-bearer-token";

import { getLogger } from "./logging";

let logger: LoggerInstance;
export function init(app: express.Express) {
	logger = getLogger();

	app.use(bearerToken());
	app.use(logRequest);
}

export function logRequest(req: express.Request, res, next) {
	logger.info(`start handling request: ${ req.method } ${ req.path } with ${ req.rawHeaders }`);
	next();
}

export function notFoundHandler(req: express.Request, res: express.Response, next: express.NextFunction) {
	// log.error(`Error 404 on ${req.url}.`);
	res.status(404).send({ status: 404, error: "Not found" });
}

export type ApiError = {
	status: number;
	error: string;
};

export function generalErrorHandler(err: any, req: express.Request, res: express.Response, next: express.NextFunction) {
	let message = "Error";

	message += `\n\tmethod: ${ req.method }`;
	message += `\n\tpath: ${ req.url }`;
	message += `\n\tpayload: ${ JSON.stringify(req.body) }`;

	if (err instanceof Error) {
		message += `\n\tmessage: ${ err.message }`;
		message += `\n\tstack: ${ err.stack }`;
	} else {
		message += `\n\tmessage: ${ err.toString() }`;
	}

	logger.error(message);
	res.status(500).send({ status: 500, error: err.message || "Server error" });
}
