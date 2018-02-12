import { Column, Entity, PrimaryColumn } from "typeorm";

import { Model, Register } from "./index";

export type OfferMeta = {
	title: string;
	image: string;
	description: string;
};

@Entity()
@Register
export class Offer extends Model {
	@PrimaryColumn({ name: "id" })
	private _id: string;

	@Column({ name: "created_date" })
	private _createdDate: Date;

	@Column({ name: "amount" })
	private _amount: number;

	@Column({ name: "cap" })
	private _cap: string;

	@Column({ name: "meta" })
	private _meta: string;

	@Column({ name: "type" })
	private _type: "spend" | "earn";

	@Column({ name: "owner_id" })
	private _ownerId: string;

	constructor() {
		super();
	}

	public get id(): string {
		return this._id;
	}

	public get createdDate(): Date {
		return this._createdDate;
	}

	public get amount(): number {
		return this._amount;
	}

	public get cap(): any {
		return JSON.parse(this._cap);
	}

	public get meta(): OfferMeta {
		return JSON.parse(this._meta);
	}

	public get type(): "spend" | "earn" {
		return this._type;
	}

	public get ownerId(): string {
		return this._ownerId;
	}
}

@Entity()
@Register
export class OfferContent extends Model {
	@PrimaryColumn({ name: "id" })
	private _id: string;

	@Column({ name: "offer_id" })
	private _offerId: string;

	@Column({ name: "content" })
	private _content: string;

	constructor() {
		super();
	}

	public get id(): string {
		return this._id;
	}

	public get offerId(): string {
		return this._offerId;
	}

	public get content(): any {
		return JSON.parse(this._content);
	}
}

@Entity()
@Register
export class OfferOwner extends Model {
	@PrimaryColumn({ name: "id" })
	private _id: string;

	@Column({ name: "name" })
	private _name: string;

	constructor() {
		super();
	}

	public get name(): string {
		return this._name;
	}
}

@Entity()
@Register
export class AppOffer extends Model {
	@PrimaryColumn({ name: "id" })
	private _id: string;

	@Column({ name: "offer_id" })
	private _offerId: string;

	@Column({ name: "app_id" })
	private _appId: string;

	constructor() {
		super();
	}

	public get id(): string {
		return this._id;
	}

	public get offerId(): string {
		return this._offerId;
	}

	public get appId(): string {
		return this._appId;
	}
}

@Entity()
@Register
export class Asset extends Model {
	@PrimaryColumn({ name: "id" })
	private _id: string;

	@Column({ name: "created_date" })
	private _createdDate: Date;

	@Column({ name: "type" })
	private _type: "coupon";

	@Column({ name: "is_used" })
	private _isUsed: boolean;

	@Column({ name: "value" })
	private _value: string;

	constructor() {
		super();
	}

	public get id(): string {
		return this._id;
	}

	public get createdDate(): Date {
		return this._createdDate;
	}

	public get type(): "coupon" {
		return this._type;
	}

	public get isUsed(): boolean {
		return this._isUsed;
	}

	public get value(): any {
		return JSON.parse(this._value);
	}
}
