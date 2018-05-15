import * as http from "http";

import { getConfig } from "./config";
import { initLogger } from "../logging";

const config = getConfig();
import { app } from "./app";

import { onError, onListening } from "../server";

const server = http.createServer(app);
server.listen(config.port);
server.on("error", onError);
server.on("listening", onListening(server));
