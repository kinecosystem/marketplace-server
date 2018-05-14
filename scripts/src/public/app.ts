import * as express from "express";
import "express-async-errors";  // handle async/await errors in middleware

import { getDefaultLogger } from "../logging";
import { getConfig } from "./config";

const config = getConfig();
const logger = getDefaultLogger();

import { createRoutes } from "./routes/index";
import { init as initModels } from "../models/index";
import { init as initCustomMiddleware, notFoundHandler, generalErrorHandler } from "./middleware";

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
createRoutes(app, "/v1");

// catch 404
app.use(notFoundHandler);
// catch errors
app.use(generalErrorHandler);

// initializing db and models
initModels().then(msg => {
	logger.debug(msg);
});
