import * as winston from "winston";
import { FileTransportOptions, GenericTextTransportOptions, GenericTransportOptions } from "winston";
import * as httpContext from "express-http-context";

export interface LogTarget {
	name: string;
	type: "console" | "file";
	level: "debug" | "info" | "warn" | "error";
	format?: "string" | "json" | "pretty-json"; // default to "string"
	timestamp?: boolean | (() => string | boolean);
}

export interface ConsoleTarget extends LogTarget {
	type: "console";
	name: "console";
}

export interface FileTarget extends LogTarget {
	type: "file";
	file: string;
}

type WinstonTransportOptions = GenericTransportOptions & GenericTextTransportOptions & { stringify?: boolean };

function createTarget(target: LogTarget): winston.TransportInstance {
	let cls: { new(options: WinstonTransportOptions): winston.TransportInstance };
	const defaults: WinstonTransportOptions = {
		timestamp: true,
	};
	const options: WinstonTransportOptions = {
		level: target.level,
		timestamp: target.timestamp,
	};

	if (target.format === "json" || target.format === "pretty-json") {
		options.json = true;
	}

	if (target.format === "json") {
		(options.stringify as boolean) = true;
	}

	switch (target.type) {
		case "console":
			defaults.level = "debug";
			cls = winston.transports.Console;
			break;

		case "file":
			defaults.level = "error";
			(options as FileTransportOptions).filename = (target as FileTarget).file;
			cls = winston.transports.File;
			break;

		default:
			throw new Error("unsupported log target type: " + target.type);
	}

	return new cls(mergeOptions(defaults, options));
}

type OptionsKey = keyof WinstonTransportOptions;

function mergeOptions(defaults: WinstonTransportOptions, options: WinstonTransportOptions): WinstonTransportOptions {
	const result = Object.assign({}, defaults);

	(Object.keys(options) as OptionsKey[])
		.filter(key => options[key] !== null && options[key] !== undefined)
		.forEach(key => result[key] = options[key]);

	return result;
}

function getLogContext() {
	const reqId = httpContext.get("reqId");
	const userId = httpContext.get("userId");
	const deviceId = httpContext.get("deviceId");
	const appId = httpContext.get("appId");
	return { req_id: reqId, user_id: userId, device_id: deviceId, app_id: appId };
}

export interface BasicLogger {
	error(message: string, options?: object): void;

	warn(message: string, options?: object): void;

	verbose(message: string, options?: object): void;

	info(message: string, options?: object): void;

	debug(message: string, options?: object): void;
}

let defaultLogger: BasicLogger;

export function initLogger(...targets: LogTarget[]): BasicLogger {
	if (defaultLogger) {
		return defaultLogger;
	}

	const winstonLogger = new winston.Logger({
		transports: targets.map(target => createTarget(target))
	});

	defaultLogger = {
		error: (message: string, options?: object) => {
			winstonLogger.error(message, { ...options, ...getLogContext() });
		},
		warn: (message: string, options?: object) => {
			winstonLogger.warn(message, { ...options, ...getLogContext() });
		},
		verbose: (message: string, options?: object) => {
			winstonLogger.verbose(message, { ...options, ...getLogContext() });
		},
		info: (message: string, options?: object) => {
			winstonLogger.info(message, { ...options, ...getLogContext() });
		},
		debug: (message: string, options?: object) => {
			winstonLogger.debug(message, { ...options, ...getLogContext() });
		}
	};

	return defaultLogger;
}

export function getDefaultLogger(): BasicLogger {
	return defaultLogger;
}
