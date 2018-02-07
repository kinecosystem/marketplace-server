import * as express from "express";
import * as bearerToken from "express-bearer-token";
import * as http from "http";
import { getConfig } from "./config";
import { getLogger } from "./logging";

import "./models/all";

const config = getConfig();
const logger = getLogger(...config.loggers);

function createApp() {
	const app = express();
	app.set("port", config.port);

	const bodyParser = require("body-parser");
	app.use(bodyParser.json());
	app.use(bodyParser.urlencoded({ extended: false }));

	const cookieParser = require("cookie-parser");
	app.use(cookieParser());
	app.use(bearerToken());

	return app;
}

export const app: express.Express = createApp();

// routes
app.use("/v1/offers", require("./routes/offers").router);
app.use("/v1/orders", require("./routes/orders").router);
app.use("/v1/transactions", require("./routes/transactions").router);

// authentication
app.use("/v1/users", require("./routes/users").router);

// catch 404
app.use((req, res, next) => {
	// log.error(`Error 404 on ${req.url}.`);
	res.status(404).send({ status: 404, error: "Not found" });
});

// catch errors
app.use((err, req, res, next) => {
	const status = err.status || 500;
	// log.error(`Error ${status} (${err.message}) on ${req.method} ${req.url} with payload ${req.body}.`);
	res.status(status).send({ status, error: "Server error" });
});

const server = http.createServer(app);
server.listen(config.port);
server.on("error", onError);
server.on("listening", onListening);

/**
 * Normalize a port into a number, string, or false.
 */
function normalizePort(val) {
	const port = parseInt(val, 10);

	if (isNaN(port)) {
		// named pipe
		return val;
	}

	if (port >= 0) {
		// port number
		return port;
	}

	return false;
}

/**
 * Event listener for HTTP server "error" event.
 */
function onError(error) {
	if (error.syscall !== "listen") {
		throw error;
	}

	// handle specific listen errors with friendly messages
	switch (error.code) {
		case "EACCES":
			logger.error(`${ config.port } requires elevated privileges`);
			process.exit(1);
			break;
		case "EADDRINUSE":
			logger.error(`${ config.port } is already in use`);
			process.exit(1);
			break;
		default:
			throw error;
	}
}

/**
 * Event listener for HTTP server "listening" event.
 */
function onListening() {
	const addr = server.address();
	logger.debug(`Listening on ${ addr.port }`);
}
