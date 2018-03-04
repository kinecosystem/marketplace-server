import { generateId, IdPrefix } from "../utils";
import { BaseEntity, Column, Entity, Index } from "typeorm";
import { CreationDateModel, register as Register } from "./index";

export type StringMap = { [key: string]: string; };  // key => value pairs

@Entity({ name: "applications" })
@Register
export class Application extends CreationDateModel {
	public static KIK_API_KEY = "A1234567890";  // XXX testing purposes

	@Column({ name: "name" })
	public name: string;

	@Column({ name: "api_key" })
	public apiKey: string;

	@Column("simple-json", { name: "jwt_public_keys" })
	public jwtPublicKeys: StringMap;

	constructor();
	constructor(appId: string, name: string, jwtPublicKeys: StringMap);
	constructor(appId?: string, name?: string, jwtPublicKeys?: StringMap) {
		super(null);
		Object.assign(this, { id: appId, name, jwtPublicKeys, apiKey: generateId(IdPrefix.App) });
	}
}

@Entity({ name: "app_whitelists" })
@Index(["appId", "appUserId"], { unique: true })
@Register
export class AppWhitelists extends CreationDateModel {
	@Column({ name: "app_id" })
	public appId: string;

	@Column({ name: "app_user_id" })
	public appUserId: string;

	constructor() {
		super();
	}
}
