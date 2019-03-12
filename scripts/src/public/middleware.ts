import * as express from "express";
import * as bearerToken from "express-bearer-token";
import * as httpContext from "express-http-context";

import { logRequest, reportMetrics, requestLogger } from "../middleware";
import { WrongBlockchainVersion } from "../errors";
import { AuthenticatedRequest } from "./auth";
import { Application } from "../models/applications";
import { NoSuchApp } from "../errors";

export { notFoundHandler, generalErrorHandler, statusHandler } from "../middleware";

export const clientMigrationCheck = async function(req: AuthenticatedRequest, res: express.Response, next: express.NextFunction) {
	const CLIENT_BLOCKCHAIN_HEADER = "x-kin-blockchain-version";
	const blockchainVersionHeader = req.header(CLIENT_BLOCKCHAIN_HEADER);

	const app = await Application.get(req.context.user.appId);
	if (!app) { // cached per instance
		throw NoSuchApp(req.context.user.appId);
	}

	const isAppMigrated = app.config.blockchain_version === "3";
	const isAppVersionEqualsToClient = app.config.blockchain_version !== blockchainVersionHeader;

	if (isAppMigrated && !isAppVersionEqualsToClient) {
		throw WrongBlockchainVersion("simulated deprecation");
	}

	next();
} as express.RequestHandler;

export function init(app: express.Express) {
	app.use(httpContext.middleware as express.RequestHandler);
	app.use(bearerToken());
	app.use(requestLogger);
	app.use(logRequest);
	app.use(reportMetrics);
}
