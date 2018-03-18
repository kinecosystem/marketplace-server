import { ConnectionOptions } from "typeorm";
import "source-map-support/register";

import { LogTarget } from "./logging";

export interface Config {
	port?: number;
	loggers?: LogTarget[];
	assets_base: string;
	db: ConnectionOptions;
	payment_service: string;
	payment_complete_callback: string;
}

export function getConfig(name: string = "default"): Config {
	return require(`../../config/${ name }.json`);
}
