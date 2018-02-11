import { Options as SqlOptions } from "sequelize";

import { LogTarget } from "./logging";

export interface DatabaseConfig {
	database: string;
	username: string;
	password: string;
	options: SqlOptions;
}

export interface Config {
	port?: number;
	loggers?: LogTarget[];
	assets_base: string;
	db: DatabaseConfig;
}

export function getConfig(name: string = "default"): Config {
	return require(`../../config/${ name }.json`);
}
