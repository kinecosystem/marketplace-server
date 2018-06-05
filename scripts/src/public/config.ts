import { Config as BaseConfig, init as baseInit, getConfig as baseGetConfig } from "../config";

export interface Config extends BaseConfig {
	assets_base: string;
	jwt: {
		public_keys_dir: string;
	};
}

export function getConfig(): Config {
	return baseGetConfig();
}

function init(): void {
	let path = "config/public.";
	/*if (process.argv.length === 3) {
		path += process.argv[2];
	} else {
		path += "default";
	}*/
	path += "default";

	baseInit(`${ path }.json`);
}

init();
