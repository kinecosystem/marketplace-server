import { Config as BaseConfig, init as baseInit, getConfig as baseGetConfig } from "../config";

export interface Config extends BaseConfig {
	assets_base: string;
	payment_service: string;
	payment_complete_callback: string;
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

	const config = getConfig();
	if (process.env.APP_PAYMENT_SERVICE) {
		config.payment_service = process.env.APP_PAYMENT_SERVICE!;
	}
	if (process.env.APP_PAYMENT_COMPLETE_CALLBACK) {
		config.payment_complete_callback = process.env.APP_PAYMENT_COMPLETE_CALLBACK!;
	}
}

init();
