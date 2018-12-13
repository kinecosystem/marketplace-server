import * as express from "express";
import * as bearerToken from "express-bearer-token";
import * as httpContext from "express-http-context";
// const httpContext = require("express-bearer-token");

import { init as baseInit, requestLogger, logRequest, reportMetrics } from "../middleware";

export * from "../middleware";

export function init(app: express.Express) {
	baseInit();
	app.use(httpContext.middleware as express.RequestHandler);
	app.use(requestLogger);
	app.use(bearerToken());
	app.use(logRequest);
	app.use(reportMetrics);
}
