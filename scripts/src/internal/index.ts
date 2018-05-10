import * as http from "http";

import { ServerError } from "../utils";
import { initLogger } from "../logging";

import { getConfig } from "./config";

const config = getConfig();
const logger = initLogger(...config.loggers!);

import { app } from "./app";

const server = http.createServer(app);
server.listen(config.port);
server.on("error", onError);
server.on("listening", onListening);

function cleanup() {
	logger.info("Shutting down");
	server.close(() => {
		logger.info("Done, have a great day!");
		process.exit(1);
	});
}

/**
 * Event listener for HTTP server "error" event.
 */
function onError(error: ServerError) {
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
	process.on("SIGINT", cleanup);
	process.on("SIGTERM", cleanup);
	logger.debug(`Listening on ${ addr.port }`);
}
