import "reflect-metadata";
import { ObjectType } from "typeorm/common/ObjectType";
import { DeepPartial } from "typeorm/common/DeepPartial";
import { BaseEntity, Column, Connection, ConnectionOptions, createConnection, PrimaryColumn } from "typeorm";

import { getConfig } from "../config";
import { generateId, IdPrefix, path } from "../utils";

const entities: ModelConstructor[] = [];

let dbConfig: ConnectionOptions;
let connection: Connection | null;
let initPromise: Promise<string> | null;

export type ModelConstructor = ({ new(): Model }) | Function;
export type ModelMemberInitializer = () => any;

export abstract class Model extends BaseEntity {
	public static new<T extends Model>(this: ObjectType<T>, data?: DeepPartial<T>): T {
		const instance = (this as typeof BaseEntity).create(data!) as T;

		for (const [name, initializer] of (this as typeof Model).initializers.entries()) {
			if (!instance[name as keyof Model]) {
				instance[name as keyof Model] = initializer();
			}
		}

		return instance;
	}

	protected static initializers = new Map<string, ModelMemberInitializer>([["id", () => generateId(IdPrefix.None)]]);

	protected static copyInitializers(add?: { [name: string]: ModelMemberInitializer }): Map<string, ModelMemberInitializer> {
		const map = new Map<string, ModelMemberInitializer>(this.initializers);
		if (add) {
			Object.keys(add).forEach(name => map.set(name, add[name]));
		}

		return map;
	}

	@PrimaryColumn()
	public id!: string;
}

export abstract class CreationDateModel extends Model {
	protected static initializers = Model.copyInitializers({ createdDate: () => new Date() });

	@Column({ name: "created_date" })
	public createdDate!: Date;
}

export function register(ctor: ModelConstructor) {
	entities.push(ctor);
}

export function initializer(propName: string, fn: ModelMemberInitializer) {
	return initializers({ [propName]: fn });
}

export function initializers(props: { [name: string]: ModelMemberInitializer }) {
	// ctor is also { initializers: Map<string, ModelMemberInitializer> }, but it's protected
	return (ctor: ModelConstructor) => {
		const parent = Object.getPrototypeOf(ctor.prototype).constructor;
		if (parent.initializers === (ctor as any).initializers) {
			(ctor as any).initializers = new Map<string, ModelMemberInitializer>(parent.initializers);
		}

		Object.keys(props).forEach(name => (ctor as any).initializers.set(name, props[name]));
	};
}

export function init(createDb?: boolean): Promise<string> {
	if (initPromise) {
		return initPromise;
	}

	dbConfig = Object.assign({}, getConfig().db, { synchronize: !!createDb });
	if (dbConfig.type === "sqlite" && !/^[./]/.test(dbConfig.database)) {
		(dbConfig as any).database = path(dbConfig.database);
	}
	(dbConfig as any).entities = entities;

	initPromise = createConnection(dbConfig)
		.then(conn => {
			connection = conn;
			return createOnConnectedString(connection.options);
		})
		.catch(error => {
			throw error;
		});

	return initPromise;
}

export async function close(): Promise<void> {
	await connection!.close();
	initPromise = null;
	connection = null;
}

export type ModelFilters<T extends Model> = Partial<{ [K in keyof T]: T[K] }>;

function createOnConnectedString(options: ConnectionOptions): string {
	let msg = `connected to ${ options.type } server`;

	switch (options.type) {
		case "sqlite":
			msg += `, db file: '${ options.database }'`;
	}

	return msg;
}
