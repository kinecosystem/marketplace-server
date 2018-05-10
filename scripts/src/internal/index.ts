import * as http from "http";

import { ServerError } from "../utils";
import { initLogger } from "../logging";

import { getConfig } from "./config";

const config = getConfig();

import { onError, onListening } from "../server";
import { app } from "./app";

const server = http.createServer(app);
server.listen(config.port);
server.on("error", onError);
server.on("listening", onListening(server));
