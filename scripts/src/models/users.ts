import { Column, Entity, PrimaryColumn } from "typeorm";

import { CreationDateModel, Model, Register } from "./index";
import { IdPrefix } from "../utils";

@Entity()
@Register
export class User extends CreationDateModel {
	@Column({ name: "app_id" })
	private _appId: string;

	@Column({ name: "app_user_id" })
	private _appUserId: string;

	@Column({ name: "activated_date" })
	private _activatedDate: Date;

	public constructor() {
		super(IdPrefix.User);
	}

	public get appId(): string {
		return this._appId;
	}

	public get appUserId(): string {
		return this._appUserId;
	}

	public get activatedDate(): Date {
		return this._activatedDate;
	}
}

@Entity()
@Register
export class AuthToken extends CreationDateModel {
	@Column({ name: "activated_date" })
	private _expireDate: Date;

	@Column({ name: "device_id" })
	private _deviceId: string;

	@Column({ name: "token", unique: true })
	private _token: string;

	@Column({ name: "user_id" })
	private _userId: string;

	@Column({ name: "valid" })
	private _valid: boolean;

	public constructor() {
		super();
	}

	public get expireDate(): Date {
		return this._expireDate;
	}

	public get deviceId(): string {
		return this._deviceId;
	}

	public get token(): string {
		return this._token;
	}

	public get userId(): string {
		return this._token;
	}

	public get valid(): boolean {
		return this._valid;
	}
}

@Entity()
@Register
export class Application extends CreationDateModel {
	@Column({ name: "name" })
	private _name: string;

	@Column({ name: "jwt_public_key" })
	private _jwtPublicKey: string;

	public constructor() {
		super(IdPrefix.App);
	}

	public get name(): string {
		return this._name;
	}

	public get jwtPublicKey(): string {
		return this._jwtPublicKey;
	}
}
