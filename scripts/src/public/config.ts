import { Config as BaseConfig, init as baseInit, getConfig as baseGetConfig, LimitConfig } from "../config";

export interface Config extends BaseConfig {
	assets_base: string;
	environment_name: string;
	ecosystem_service: string;
	internal_service: string;
	limits: LimitConfig;
}

export function getConfig(): Config {
	return baseGetConfig();
}

function init(): void {
	baseInit("config/public.default.json");
}

init();
