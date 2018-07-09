import * as express from "express";
import "express-async-errors";  // handle async/await errors in middleware

import { getConfig } from "./config";
import { initLogger } from "../logging";

const config = getConfig();
const logger = initLogger(...config.loggers!);

import { createRoutes } from "./routes";
import { initPaymentCallbacks } from "./services";
import { init as initModels } from "../models/index";
import { init as initCustomMiddleware, notFoundHandler, generalErrorHandler } from "./middleware";

function createApp() {
	const app = express();
	app.set("port", config.port);

	const bodyParser = require("body-parser");
	app.use(bodyParser.json());
	app.use(bodyParser.urlencoded({ extended: false }));

	initCustomMiddleware(app);

	return app;
}

export const app: express.Express = createApp();

// routes
createRoutes(app);

// catch 404
app.use(notFoundHandler);
// catch errors
app.use(generalErrorHandler);

export async function init() {
	// initializing db and models
	const msg = await initModels();
	logger.info("init db", { msg });
	const res = await initPaymentCallbacks(logger);
	logger.info("init payment result", { res });
}
