import { LogTarget } from "./logging";

export type Config = {
	port?: number;
	loggers?: LogTarget[];
}

export function getConfig(name: string = "default"): Config {
	return require(`../../config/${ name }.json`);
}