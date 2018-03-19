import { Config as BaseConfig, getConfig as getConfigBase } from "../config";

export interface Config extends BaseConfig {
	assets_base: string;
	payment_service: string;
	payment_complete_callback: string;
}

export function getConfig(): Config {
	let path = "config/public.";
	if (process.argv.length === 3) {
		path += process.argv[2];
	} else {
		path += "default";
	}

	return getConfigBase(`${ path }.json`);
}

// call this to set the config to use, so that who ever calls the base getConfig will work
getConfig();
