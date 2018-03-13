import { ConnectionOptions } from "typeorm";

import { path } from "./utils";

import { LogTarget } from "./logging";

export interface Config {
	port?: number;
	loggers?: LogTarget[];
	db: ConnectionOptions;
}

let config: Config;
export function getConfig<T extends Config>(filePath?: string): T {
	if (config) {
		return config as T;
	}

	config = require(path(filePath));
	return config as T;
}
