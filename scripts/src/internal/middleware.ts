import * as express from "express";

import { init as baseInit, logRequest, requestLogger, reportMetrics } from "../middleware";

export * from "../middleware";

export function init(app: express.Express) {
	baseInit();

	app.use(requestLogger);
	app.use(logRequest);
	app.use(reportMetrics);
}
