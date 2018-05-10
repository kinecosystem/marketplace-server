import { Server } from "http";

import { getConfig } from "./config";
import { ServerError } from "./utils";
import { getDefaultLogger } from "./logging";

const config = getConfig();
const logger = getDefaultLogger();

function cleanup(server: Server) {
	logger.info("Shutting down");
	server.close(() => {
		logger.info("Done, have a great day!");
		process.exit(0);
	});
}

/**
 * Event listener for HTTP server "error" event.
 */
export function onError(error: ServerError) {
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
export function onListening(server: Server) {
	return () => {
		const addr = server.address();
		const handler = cleanup.bind(null, server);
		process.on("SIGINT", handler);
		process.on("SIGTERM", handler);
		logger.debug(`Listening on ${ addr.port }`);
	};
}
