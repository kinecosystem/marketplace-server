import * as express from "express";
import "express-async-errors"; // handle async/await errors in middleware
import { initLogger } from "../logging";
import { getConfig } from "./config";
import { init as initModels } from "../models/index";
import { init as initRemoteConfig } from "./routes/config";
import { createRoutes, createV1Routes } from "./routes/index";
import { generalErrorHandler, init as initCustomMiddleware, notFoundHandler } from "./middleware";

const config = getConfig();
const logger = initLogger(...config.loggers!);

function createApp() {
	const app = express();
	app.set("port", config.port);

	const bodyParser = require("body-parser");
	app.use(bodyParser.json());
	app.use(bodyParser.urlencoded({ extended: false }));

	const cookieParser = require("cookie-parser");
	app.use(cookieParser());

	initCustomMiddleware(app);

	return app;
}

export const app: express.Express = createApp();

// routes
createRoutes(app, "/v2");
createV1Routes(app, "/v1");

// catch 404
app.use(notFoundHandler);
// catch errors
app.use(generalErrorHandler);

export async function init() {
	// initializing db and models
	const msg = await initModels();
	logger.debug(msg);
	await initRemoteConfig();
}
