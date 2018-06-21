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
	internal_service: string;
	app_name?: string;
	commit?: string;
	timestamp?: string;
	bi_service: string;
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
	if (process.env.APP_INTERNAL_SERVICE) {
		config.internal_service = process.env.APP_INTERNAL_SERVICE!;
	}
	if (process.env.APP_BI_SERVICE) {
		config.bi_service = process.env.APP_BI_SERVICE!;
	}
	if (process.env.APP_NAME) {
		config.app_name = process.env.APP_NAME;
	}
	if (process.env.BUILD_COMMIT) {
		config.commit = process.env.BUILD_COMMIT;
	}
	if (process.env.BUILD_TIMESTAMP) {
		config.timestamp = process.env.BUILD_TIMESTAMP;
	}
	if (process.env.APP_REDIS) {
		config.redis = process.env.APP_REDIS;
	}
}

export function getConfig<T extends Config>(): T {
	return config as T;
}
