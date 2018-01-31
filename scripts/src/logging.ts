import * as winston from "winston";
import {GenericTextTransportOptions} from "winston";
import {GenericTransportOptions} from "winston";
import {FileTransportOptions} from "winston";

export interface LogTarget {
	name: string;
	type: "console" | "file";
	level: "debug" | "info" | "warn" | "error";
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

export function getLogger(...targets: LogTarget[]): winston.LoggerInstance {
	const options: winston.LoggerOptions = {};
	options.transports = targets.map(target => createTarget(target));

	return new winston.Logger(options);
}

type WinstonTransportOptions = GenericTransportOptions & GenericTextTransportOptions;
function createTarget(target: LogTarget): winston.TransportInstance {
	let cls: { new (options: WinstonTransportOptions): winston.TransportInstance };
	const defaults: WinstonTransportOptions = {
		timestamp: true
	};
	const options: WinstonTransportOptions = {
		level: target.level,
		timestamp: target.timestamp
	};

	switch (target.type) {
		case "console":
			defaults.level = "debug";
			cls = winston.transports.Console;
			break;

		case "file":
			defaults.level = "error";
			(options as FileTransportOptions).filename = (target as FileTarget).file;
			cls = winston.transports.File;
			/*return new winston.transports.File({
				filename: (target as FileTarget).file,
				level: target.level,
				timestamp: true
			});*/
			break;

		default:
			throw new Error("unsupported log target type: " + target.type);
	}

	return new cls(mergeOptions(defaults, options));
}

function mergeOptions(defaults: WinstonTransportOptions, options: WinstonTransportOptions): WinstonTransportOptions {
	const result = Object.assign({}, defaults);
	Object.keys(options)
		.filter(key => options[key] !== null && options[key] !== undefined)
		.forEach(key => result[key] = options[key]);

	return result;
}
