import { Server } from "http";

import * as metrics from "./metrics";
import { getConfig } from "./config";
import { ServerError } from "./utils/utils";
import { getDefaultLogger as log } from "./logging";

const config = getConfig();

function cleanup(server: Server) {
	log().info("Shutting down");
	server.close(() => {
		log().info("Done, have a great day!");
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
			log().error(`${ config.port } requires elevated privileges`);
			process.exit(1);
			break;
		case "EADDRINUSE":
			log().error(`${ config.port } is already in use`);
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
		const addr = server.address() as { port: number };
		const handler = cleanup.bind(null, server);
		process.on("SIGINT", handler);
		process.on("SIGTERM", handler);
		log().debug(`Listening on ${ addr.port }`);
	};
}

/**
 *
 */
export function abort(reason?: string, appId?: string) {
	metrics.reportProcessAbort(reason, appId);
	process.exit(1);  // process manager should restart the process
}
