import { Column, Entity, PrimaryColumn } from "typeorm";

import { CreationDateModel, Model, Register } from "./index";
import { generateId, IdPrefix } from "../utils";

@Entity({ name: "users" })
@Register
export class User extends CreationDateModel {
	@Column({ name: "app_id" })
	public appId: string;

	@Column({ name: "app_user_id" })
	public appUserId: string;

	@Column({ name: "wallet_address" })
	public walletAddress: string;

	@Column({ name: "activated_date", nullable: true })
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

@Entity({ name: "auth_tokens" })
@Register
export class AuthToken extends CreationDateModel {
	@Column({ name: "expire_date" })
	public expireDate: Date;

	@Column({ name: "device_id" })
	public deviceId: string;

	@Column({ name: "user_id" })
	public userId: string;

	@Column()
	public valid: boolean;

	constructor();
	constructor(userId: string, deviceId: string, valid: boolean);
	constructor(userId?: string, deviceId?: string, valid?: boolean) {
		super(IdPrefix.None); // the id is the actual token
		const expireDate = new Date();
		expireDate.setDate(expireDate.getDate() + 14);

		// XXX token could be a JWT
		Object.assign(this, { expireDate, userId, deviceId, valid });
	}

	public isExpired(): boolean {
		return this.expireDate > new Date();
	}

	public isAboutToExpire(): boolean {
		const dayFromNow = new Date();
		dayFromNow.setDate(dayFromNow.getDate() + 1);
		return this.expireDate > dayFromNow;
	}

}

@Entity({ name: "applications" })
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
