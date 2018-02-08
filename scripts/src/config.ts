import { LogTarget } from "./logging";
import { Options as SqlOptions } from "sequelize";

export type DatabaseConfig = {
	database: string;
	username: string;
	password: string;
	options: SqlOptions;
};

export type Config = {
	port?: number;
	loggers?: LogTarget[];
	assets_base: string;
	db: DatabaseConfig;
};

export function getConfig(name: string = "default"): Config {
	return require(`../../config/${ name }.json`);
}
