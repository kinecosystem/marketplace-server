import * as http from "http";

import { getConfig } from "./config";
import { initLogger } from "../logging";

const config = getConfig();
const logger = initLogger(...config.loggers!);

import { onError, onListening } from "../server";
import { app } from "./app";

const server = http.createServer(app);
server.listen(config.port);
server.on("error", onError);
server.on("listening", onListening(server));
