import { ConnectionOptions } from "typeorm";
import "source-map-support/register";

import { path } from "./utils";

import { LogTarget } from "./logging";

export interface Config {
	port?: number;
	host: string;
	loggers?: LogTarget[];
	db: ConnectionOptions;
	redis: "mock" | string;
	statsd: {
		host: string;
		port: number;
	};
	payment_service: string;
	payment_complete_callback: string;
}

let config: Config;

export function init(filePath: string) {
	if (config) {
		return;
	}
	config = require(path(filePath!));
	config.port = parseInt(process.env.APP_PORT || "", 10) || config.port;
	config.host = process.env.APP_HOST || config.host;
	if (process.env.APP_DB_TYPE) {
		(config.db as any).type = process.env.APP_DB_TYPE!;
	}
	if (process.env.APP_DB_USERNAME) {
		(config.db as any).username = process.env.APP_DB_USERNAME!;
	}
	if (process.env.APP_DB_PASSWORD) {
		(config.db as any).password = process.env.APP_DB_PASSWORD!;
	}
	if (process.env.APP_DB_PORT) {
		(config.db as any).port = parseInt(process.env.APP_DB_PORT!, 10);
	}
	if (process.env.APP_DB_HOST) {
		(config.db as any).host = process.env.APP_DB_HOST!;
	}
	if (process.env.APP_DB_DATABASE) {
		(config.db as any).database = process.env.APP_DB_DATABASE!;
	}
	if (process.env.APP_PAYMENT_SERVICE) {
		config.payment_service = process.env.APP_PAYMENT_SERVICE!;
	}
	if (process.env.APP_PAYMENT_COMPLETE_CALLBACK) {
		config.payment_complete_callback = process.env.APP_PAYMENT_COMPLETE_CALLBACK!;
	}
}

export function getConfig<T extends Config>(): T {
	return config as T;
}
