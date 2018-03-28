import * as express from "express";
import * as bearerToken from "express-bearer-token";

import { init as baseInit, requestLogger, logRequest, reportMetrics } from "../middleware";

export * from "../middleware";

export function init(app: express.Express) {
	baseInit();

	app.use(requestLogger);
	app.use(bearerToken());
	app.use(logRequest);
	app.use(reportMetrics);
}
