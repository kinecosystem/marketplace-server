import { Column, Entity, PrimaryColumn } from "typeorm";

import { CreationDateModel, Model, register } from "./index";
import { generateId, IdPrefix } from "../utils";

@Entity()
@register
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
	constructor(userId: string, appId: string, walletAddress: string);
	constructor(userId?: string, appId?: string, walletAddress?: string) {
		super(IdPrefix.User);
		Object.assign(this, { userId, appId, walletAddress });
	}

	public get activated(): boolean {
		return !!this.activatedDate;
	}
}

@Entity()
@register
export class AuthToken extends CreationDateModel {
	@Column({ name: "expire_date" })
	public expireDate: Date;

	@Column({ name: "device_id" })
	public deviceId: string;

	@Column()
	public token: string;

	@Column({ name: "user_id" })
	public userId: string;

	@Column()
	public valid: boolean;

	constructor();
	constructor(userId: string, deviceId: string, valid: boolean);
	constructor(userId?: string, deviceId?: string, valid?: boolean) {
		super(IdPrefix.None);
		Object.assign(this, { userId, deviceId, valid });
	}
}

@Entity()
@register
export class Application extends CreationDateModel {
	@Column()
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
