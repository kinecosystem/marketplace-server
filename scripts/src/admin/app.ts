import * as express from "express";
import "express-async-errors";  // handle async/await errors in middleware

import { getConfig } from "./config";
import { initLogger } from "../logging";
import { init as initMigration } from "./migration";

const config = getConfig();
const logger = initLogger(...config.loggers!);
import { createRoutes } from "./routes";
import { init as initModels } from "../models/index";
import { notFoundHandler, generalErrorHandler } from "../middleware";

function createApp() {
	const app = express();
	app.set("port", getConfig().port);

	const bodyParser = require("body-parser");
	app.use(bodyParser.json());
	app.use(bodyParser.urlencoded({ extended: false }));

	return app;
}

export const app: express.Express = createApp();

// routes
createRoutes(app);

// catch 404
app.use(notFoundHandler);
// catch errors
app.use(generalErrorHandler);

async function init() {
	await initMigration();
	await initModels();
}

// initializing db and models
init().then(msg => {
	logger.info("init admin");
});
