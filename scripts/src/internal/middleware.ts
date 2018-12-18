import * as express from "express";

import { logRequest, requestLogger, reportMetrics } from "../middleware";

export * from "../middleware";

export function init(app: express.Express) {
	app.use(requestLogger);
	app.use(logRequest);
	app.use(reportMetrics);
}
