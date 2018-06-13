import * as express from "express";
import "express-async-errors";  // handle async/await errors in middleware

import { getConfig } from "./config";
import { initLogger } from "../logging";

const config = getConfig();
const logger = initLogger(...config.loggers!);

import { createRoutes } from "./routes";
import { init as initModels } from "../models/index";
import { notFoundHandler, generalErrorHandler } from "../middleware";

function createApp() {
	const app = express();
	app.set("port", getConfig().port);
	return app;
}

export const app: express.Express = createApp();

// routes
createRoutes(app);

// catch 404
app.use(notFoundHandler);
// catch errors
app.use(generalErrorHandler);

// initializing db and models
initModels().then(msg => {
	logger.info("init db");
});
