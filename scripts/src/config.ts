import { ConnectionOptions } from "typeorm";
import "source-map-support/register";

import { path } from "./utils";

import { LogTarget } from "./logging";

export interface Config {
	port?: number;
	loggers?: LogTarget[];
	db: ConnectionOptions;
	redis: "mock" | string;
}

let config: Config;

export function init(filePath: string) {
	config = require(path(filePath!));
}

export function getConfig<T extends Config>(): T {
	return config as T;
}
