import { Column, Entity, PrimaryColumn } from "typeorm";

import { Model, Register } from "./index";

@Entity()
@Register
export class User extends Model {
	@PrimaryColumn({ name: "id" })
	private _id: string;

	@Column({ name: "app_id" })
	private _appId: string;

	@Column({ name: "app_user_id" })
	private _appUserId: string;

	@Column({ name: "created_date" })
	private _createdDate: Date;

	@Column({ name: "activated_date" })
	private _activatedDate: Date;

	constructor() {
		super();
	}

	public get id(): string {
		return this._id;
	}

	public get appId(): string {
		return this._appId;
	}

	public get appUserId(): string {
		return this._appUserId;
	}

	public get createdDate(): Date {
		return this._createdDate;
	}

	public get activatedDate(): Date {
		return this._activatedDate;
	}
}

@Entity()
@Register
export class AuthToken extends Model {
	@PrimaryColumn({ name: "id" })
	private _id: string;

	@Column({ name: "created_date" })
	private _createdDate: Date;

	@Column({ name: "activated_date" })
	private _expireDate: Date;

	@Column({ name: "device_id" })
	private _deviceId: string;

	@Column({ name: "token" })
	private _token: string;

	@Column({ name: "user_id" })
	private _userId: string;

	@Column({ name: "valid" })
	private _valid: boolean;

	constructor() {
		super();
	}

	public get id(): string {
		return this._id;
	}

	public get createdDate(): Date {
		return this._createdDate;
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
export class Application extends Model {
	@PrimaryColumn({ name: "id" })
	private _id: string;

	@Column({ name: "created_date" })
	private _createdDate: Date;

	@Column({ name: "name" })
	private _name: string;

	@Column({ name: "jwt_public_key" })
	private _jwtPublicKey: string;

	constructor() {
		super();
	}

	public get id(): string {
		return this._id;
	}

	public get createdDate(): Date {
		return this._createdDate;
	}

	public get name(): string {
		return this._name;
	}

	public get jwtPublicKey(): string {
		return this._jwtPublicKey;
	}
}
