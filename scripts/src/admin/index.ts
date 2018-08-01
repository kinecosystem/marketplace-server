import * as http from "http";

import { getConfig } from "./config";
import { initLogger } from "../logging";

import { app } from "./app";

import { onError, onListening } from "../server";

const server = http.createServer(app);
server.listen(getConfig().port);
server.on("error", onError);
server.on("listening", onListening(server));
