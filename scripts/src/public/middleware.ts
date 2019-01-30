import * as express from "express";
import * as bearerToken from "express-bearer-token";
import * as httpContext from "express-http-context";

import { logRequest, reportMetrics, requestLogger } from "../middleware";
import { BlockchainEndpointChanged } from "../errors";

export { notFoundHandler, generalErrorHandler, statusHandler } from "../middleware";

const deprecationError = function(req: express.Request, res: express.Response, next: express.NextFunction) {
	const shouldRaiseError = req.header("x-simulate-deprecation-error");
	if (shouldRaiseError) {
		throw BlockchainEndpointChanged("simulated deprecation");
	}
	next();
} as express.RequestHandler;

export function init(app: express.Express) {
	app.use(httpContext.middleware as express.RequestHandler);
	app.use(bearerToken());
	app.use(requestLogger);
	app.use(logRequest);
	app.use(reportMetrics);
	app.use(deprecationError);
}
