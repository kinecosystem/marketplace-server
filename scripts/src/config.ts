import { ConnectionOptions } from "typeorm";
import "source-map-support/register";

import { path } from "./utils/path";

import { LogTarget } from "./logging";

export interface LimitConfig {
	hourly_registration: number;
	minute_registration: number;
	hourly_total_earn: number;
	minute_total_earn: number;
	daily_user_earn: number;
}

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
	(config.db as any).type = process.env.APP_DB_TYPE || config.db.type;
	(config.db as any).username = process.env.APP_DB_USERNAME || (config.db as any).username;
	(config.db as any).password = process.env.APP_DB_PASSWORD || (config.db as any).password;
	(config.db as any).port = parseInt(process.env.APP_DB_PORT || "", 10) || (config.db as any).port;
	(config.db as any).host = process.env.APP_DB_HOST || (config.db as any).host;
	(config.db as any).database = process.env.APP_DB_DATABASE || (config.db as any).database;
	config.payment_service = process.env.APP_PAYMENT_SERVICE || config.payment_service;
	config.internal_service = process.env.APP_INTERNAL_SERVICE || config.internal_service;
	config.bi_service = process.env.APP_BI_SERVICE || config.bi_service;
	config.app_name = process.env.APP_NAME || config.app_name;
	config.commit = process.env.BUILD_COMMIT || config.commit;
	config.timestamp = process.env.BUILD_TIMESTAMP || config.timestamp;
	config.redis = process.env.APP_REDIS || config.redis;
}

export function getConfig<T extends Config>(): T {
	return config as T;
}
