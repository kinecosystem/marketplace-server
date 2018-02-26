import "reflect-metadata";
import { BaseEntity, Column, createConnection, PrimaryColumn, Connection, ConnectionOptions } from "typeorm";

import { getConfig } from "../config";
import { normalizeError, path, IdPrefix, generateId } from "../utils";

const dbConfig = Object.assign(getConfig().db);
if (dbConfig.type === "sqlite" && !/^[./]/.test(dbConfig.database)) {
	dbConfig.database = path(dbConfig.database);
}

const entities: ModelConstructor[] = [];
let connection: Connection;
let initPromise: Promise<string>;

export type ModelConstructor = { new(): Model };
export abstract class Model extends BaseEntity {
	@PrimaryColumn()
	public id: string;

	protected constructor(prefix: IdPrefix = IdPrefix.None) {
		super();
		this.id = generateId(prefix);
	}
}

export abstract class CreationDateModel extends Model {
	@Column({ name: "created_date" })
	public createdDate: Date;

	protected constructor(prefix?: IdPrefix) {
		super(prefix);
		this.createdDate = new Date();
	}
}

export function register(ctor: ModelConstructor) {
	entities.push(ctor);
}

export function init(): Promise<string> {
	if (initPromise) {
		return initPromise;
	}

	dbConfig.entities = entities;

	initPromise = createConnection(dbConfig)
		.then(conn => {
			connection = conn;
			return createOnConnectedString(connection.options);
		})
		.catch(error => {
			return normalizeError(error);
		});

	return initPromise;
}

export function close(): Promise<void> {
	return connection.close();
}

function createOnConnectedString(options: ConnectionOptions): string {
	let msg = `connected to ${ options.type } server`;

	switch (options.type) {
		case "sqlite":
			msg += `, db file: '${ options.database }'`;
	}

	return msg;
}
