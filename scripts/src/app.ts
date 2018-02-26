import * as express from "express";

// handle async/await errors in middleware
import "express-async-errors";

import { getConfig } from "./config";
import { initLogger } from "./logging";

const config = getConfig();
const logger = initLogger(...config.loggers);

import { createRoutes } from "./routes/index";
import { init as initModels } from "./models/index";
import { init as initCustomMiddleware } from "./middleware";

// make sure that the model files are used, this is only for now because they are not really used

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
app.use((req, res) => {
	// log.error(`Error 404 on ${req.url}.`);
	res.status(404).send({ status: 404, error: "Not found" });
});

// catch errors
app.use((err: any, req: express.Request, res: express.Response) => {
	let message = "Error\n";

	message += `\tmethod: ${ req.method }`;
	message += `\tpath: ${ req.url }`;
	message += `\tpayload: ${ req.body }`;

	if (err instanceof Error) {
		message += `\tmessage: ${ err.message }`;
		message += `\tstack: ${ err.stack }`;
	} else {
		message += `\tmessage: ${ err.toString() }`;
	}

	logger.error(message);
	res.status(500).send({ status, error: err.message || "Server error" });
});

// initializing db and models
initModels().then(msg => {
	logger.debug(msg);
});
