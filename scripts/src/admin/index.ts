import * as http from "http";
import * as net from "net";

import { getConfig } from "./config";

import { app } from "./app";

import { onError, onListening } from "../server";
import { start as nodeConsoleStart } from "../node-console";

const server = http.createServer(app);
server.listen(getConfig().port);
server.on("error", onError);
server.on("listening", onListening(server));

const remoteReplServer = net.createServer(socket => {
	console.log("new connection, environment_name:", process.env.environment_name);
	nodeConsoleStart(socket, process.env.environment_name === "production" ? "Your on production!!!" : "");
});

remoteReplServer.listen(3003);
remoteReplServer.on("error", onError);
remoteReplServer.on("listening", onListening(remoteReplServer));

module.exports = { server, remoteReplServer };
