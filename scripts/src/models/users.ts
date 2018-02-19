import { Column, Entity, PrimaryColumn } from "typeorm";

import { CreationDateModel, Model, Register } from "./index";
import { generateId, IdPrefix } from "../utils";

@Entity()
@Register
export class User extends CreationDateModel {
	@Column({ name: "app_id" })
	public appId: string;

	@Column({ name: "app_user_id" })
	public appUserId: string;

	@Column({ name: "wallet_address" })
	public walletAddress: string;

	@Column({ name: "activated_date" })
	public activatedDate: Date;

	constructor();
	constructor(appUserId: string, appId: string, walletAddress: string);
	constructor(appUserId?: string, appId?: string, walletAddress?: string) {
		super(IdPrefix.User);
		Object.assign(this, { appUserId, appId, walletAddress });
	}

	public get activated(): boolean {
		return !!this.activatedDate;
	}
}

@Entity()
@Register
export class AuthToken extends CreationDateModel {
	@Column({ name: "activated_date" })
	public expireDate: Date;

	@Column({ name: "device_id" })
	public deviceId: string;

	@Column({ name: "token" })
	public token: string;

	@Column({ name: "user_id" })
	public userId: string;

	@Column({ name: "valid" })
	public valid: boolean;

	constructor();
	constructor(userId: string, deviceId: string, valid: boolean);
	constructor(userId?: string, deviceId?: string, valid?: boolean) {
		super(IdPrefix.None);
		Object.assign(this, { userId, deviceId, valid });
	}
}

@Entity()
@Register
export class Application extends CreationDateModel {
	@Column({ name: "name" })
	public name: string;

	@Column({ name: "jwt_public_key" })
	public jwtPublicKey: string;

	constructor();
	constructor(name: string, jwtPublicKey: string);
	constructor(name?: string, jwtPublicKey?: string) {
		super(IdPrefix.App);
		Object.assign(this, { name, jwtPublicKey });
	}
}
