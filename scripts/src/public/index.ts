// for cluster master
import * as cluster from "cluster";
import * as os from "os";

// for cluster workers
import * as http from "http";
import { getConfig } from "./config";

const config = getConfig();
import { app, init } from "./app";

import { onError, onListening } from "../server";

if (cluster.isMaster) {
	// Count the machine's CPUs
	const cpuCount = os.cpus().length;
	// Create a worker for each CPU
	os.cpus().forEach(() => cluster.fork());
	// Listen for dying workers
	cluster.on("exit", worker => {
		// Replace the dead worker, we're not sentimental
		console.log(`Worker ${worker.id} died`);
		cluster.fork();
	});
} else {
	init().then(() => {
		const server = http.createServer(app);
		server.listen(config.port);
		server.on("error", onError);
		server.on("listening", onListening(server));
		console.log(`Worker ${cluster.worker.id} running`);
	}).catch(e => {
		console.log(`Worker ${cluster.worker.id} failed: failed to start server: ${e}`);
		process.exit(1);
	});
}
