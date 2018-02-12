import "reflect-metadata";
import { BaseEntity, createConnection } from "typeorm";
import { ConnectionOptions } from "typeorm/connection/ConnectionOptions";

import { getConfig } from "../config";
import { normalizeError, path } from "../utils";

const dbConfig = Object.assign(getConfig().db);
if (dbConfig.type === "sqlite" && !/^[./]/.test(dbConfig.database)) {
	dbConfig.database = path(dbConfig.database);
}

const entities: ModelConstructor[] = [];

export type ModelConstructor = { new(): Model };
export abstract class Model extends BaseEntity {
	protected constructor() {
		super();
	}
}

export function Register(ctor: ModelConstructor) {
	entities.push(ctor);
}

export function init(): Promise<string> {
	dbConfig.entities = entities;

	return createConnection(dbConfig)
		.then(connection => {
			return createOnConnectedString(connection.options);
		})
		.catch(error => {
			return normalizeError(error);
		});
}

function createOnConnectedString(options: ConnectionOptions): string {
	let str = `connected to ${ options.type } server`;

	switch (options.type) {
		case "sqlite":
			str += `, db file: '${ options.database }'`;
	}

	return str;
}
