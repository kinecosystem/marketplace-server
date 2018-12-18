import * as express from "express";
import * as bearerToken from "express-bearer-token";
import * as httpContext from "express-http-context";

import { logRequest, reportMetrics, requestLogger } from "../middleware";

export * from "../middleware";

export function init(app: express.Express) {
	app.use(httpContext.middleware as express.RequestHandler);
	app.use(bearerToken());
	app.use(requestLogger);
	app.use(logRequest);
	app.use(reportMetrics);
}
