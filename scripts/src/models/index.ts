import "reflect-metadata";
import { BaseEntity, Column, createConnection, PrimaryColumn } from "typeorm";
import { ConnectionOptions } from "typeorm/connection/ConnectionOptions";

import { getConfig } from "../config";
import { normalizeError, path, IdPrefix, generateId } from "../utils";

const dbConfig = Object.assign(getConfig().db);
if (dbConfig.type === "sqlite" && !/^[./]/.test(dbConfig.database)) {
	dbConfig.database = path(dbConfig.database);
}

const entities: ModelConstructor[] = [];

export type ModelConstructor = { new(): Model };
export abstract class Model extends BaseEntity {
	@PrimaryColumn({ name: "id" })
	private _id: string;

	protected constructor(prefix: IdPrefix = IdPrefix.None) {
		super();
		this._id = generateId(prefix);
	}

	public get id(): string {
		return this._id;
	}
}

export abstract class CreationDateModel extends Model {
	@Column({ name: "created_date" })
	private _createdDate: Date;

	protected constructor(prefix?: IdPrefix) {
		super(prefix);
		this._createdDate = new Date();
	}

	public get createdDate(): Date {
		return this._createdDate;
	}
}

export function register(ctor: ModelConstructor) {
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
	let msg = `connected to ${ options.type } server`;

	switch (options.type) {
		case "sqlite":
			msg += `, db file: '${ options.database }'`;
	}

	return msg;
}
