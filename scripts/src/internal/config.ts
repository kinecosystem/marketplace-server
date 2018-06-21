import { Config as BaseConfig, getConfig as baseGetConfig, init as baseInit } from "../config";

export interface Config extends BaseConfig {
	jwt: {
		private_keys_dir: string;
		public_keys_dir: string;
	};
}

export function getConfig(): Config {
	return baseGetConfig();
}

function init(): void {
	let path = "config/internal.";
	/*if (process.argv.length === 3) {
		path += process.argv[2];
	} else {
		path += "default";
	}*/
	path += "default";

	baseInit(`${ path }.json`);
}

init();
