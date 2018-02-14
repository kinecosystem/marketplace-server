import { Column, Entity, PrimaryColumn } from "typeorm";

import { CreationDateModel, Model, Register } from "./index";

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
}

@Entity()
@Register
export class Application extends CreationDateModel {
	@Column({ name: "name" })
	public name: string;

	@Column({ name: "jwt_public_key" })
	public jwtPublicKey: string;
}
