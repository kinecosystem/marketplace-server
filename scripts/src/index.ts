import * as express from "express";
import * as http from "http";

const port = 3000;

function createApp() {
	const app = express();
	app.set("port", port);

	const bodyParser = require("body-parser");
	app.use(bodyParser.json());
	app.use(bodyParser.urlencoded({ extended: false }));

	const cookieParser = require("cookie-parser");
	app.use(cookieParser());

	return app;
}

export const app: express.Express = createApp();

// routes
app.use("/v1/offers", require("./routes/offers").router);
app.use("/v1/orders", require("./routes/orders").router);
app.use("/v1/transactions", require("./routes/transactions").router);

// catch 404
app.use((req, res, next) => {
	//log.error(`Error 404 on ${req.url}.`);
	res.status(404).send({ status: 404, error: "Not found" });
});

// catch errors
app.use((err, req, res, next) => {
	const status = err.status || 500;
	//log.error(`Error ${status} (${err.message}) on ${req.method} ${req.url} with payload ${req.body}.`);
	res.status(status).send({ status, error: "Server error" });
});

const server = http.createServer(app);
server.listen(port);
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
function onError (error) {
	if (error.syscall !== "listen") {
		throw error;
	}

	const bind = typeof port === "string" ? `Pipe ${port}` : `Port ${port}`;

	// handle specific listen errors with friendly messages
	switch (error.code) {
		case "EACCES":
			//log.fatal(`${bind} requires elevated privileges`);
			process.exit(1);
			break;
		case "EADDRINUSE":
			//log.fatal(`${bind} is already in use`);
			process.exit(1);
			break;
		default:
			throw error;
	}
}

/**
 * Event listener for HTTP server "listening" event.
 */
function onListening () {
	const addr = server.address();
	const bind = typeof addr === "string" ? `pipe ${addr}` : `port ${addr.port}`;
	//log.debug(`Listening on ${bind}`);
}
