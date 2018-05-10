import * as http from "http";

import { getConfig } from "./config";
import { app } from "./app";

const config = getConfig();

import { onError, onListening } from "../server";

const server = http.createServer(app);
server.listen(config.port);
server.on("error", onError);
server.on("listening", onListening(server));
