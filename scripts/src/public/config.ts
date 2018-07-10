import { Config as BaseConfig, init as baseInit, getConfig as baseGetConfig } from "../config";

export interface Config extends BaseConfig {
	assets_base: string;
	webview: string;
	environment_name: string;
	ecosystem_service: string;
	max_daily_earn_offers: null | number; // null marks no limit
	internal_service: string;
	sign_in_types: string[];
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
