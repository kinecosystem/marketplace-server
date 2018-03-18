import { Config as BaseConfig, getConfig as getConfigBase } from "../config";

export interface Config extends BaseConfig {}

export function getConfig(): Config {
	let path = "config/internal.";
	if (process.argv.length === 3) {
		path += process.argv[2];
	} else {
		path += "default";
	}

	return getConfigBase(`${ path }.json`);
}

getConfig();