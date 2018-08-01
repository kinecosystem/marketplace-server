import { Config as BaseConfig, getConfig as baseGetConfig, init as baseInit } from "../config";

export interface Config extends BaseConfig {
}

export function getConfig(): Config {
	return baseGetConfig();
}

function init(): void {
	baseInit(`config/internal.default.json`);
}

init();
