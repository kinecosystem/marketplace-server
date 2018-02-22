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

export function logRequest(req, res, next) {
	logger.info(`start handling request: ${ req.path }`);
	next();
}
