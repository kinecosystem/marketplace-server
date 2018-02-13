import { Column, Entity, Index, PrimaryColumn } from "typeorm";

import { CreationDateModel, Model, Register } from "./index";
import { IdPrefix } from "../utils";

export type OfferMeta = {
	title: string;
	image: string;
	description: string;
};

export type OfferType = "spend" | "earn";

@Entity()
@Register
export class Offer extends CreationDateModel {
	@Column({ name: "amount" })
	private _amount: number;

	@Column("simple-json", { name: "cap" })
	private _cap: any;

	@Column("simple-json", { name: "meta" })
	private _meta: OfferMeta;

	@Column({ name: "type" })
	private _type: OfferType;

	@Column({ name: "owner_id" })
	private _ownerId: string;

	public constructor() {
		super(IdPrefix.Offer);
	}

	public get amount(): number {
		return this._amount;
	}

	public get cap(): any {
		return this._cap;
	}

	public get meta(): OfferMeta {
		return this._meta;
	}

	public get type(): OfferType {
		return this._type;
	}

	public get ownerId(): string {
		return this._ownerId;
	}
}

@Entity()
@Register
@Index(["_offerId", "_content"], { unique: true })
export class OfferContent extends Model {
	@PrimaryColumn({ name: "offer_id" })
	private _offerId: string;

	@PrimaryColumn({ name: "content" })
	private _content: string;

	public constructor() {
		super();
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
	@Column({ name: "name" })
	private _name: string;

	public constructor() {
		super();
	}

	public get name(): string {
		return this._name;
	}
}

@Entity()
@Register
@Index(["_offerId", "_appId"], { unique: true })
export class AppOffer extends Model {
	@PrimaryColumn({ name: "offer_id" })
	private _offerId: string;

	@PrimaryColumn({ name: "app_id" })
	private _appId: string;

	public constructor() {
		super();
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
export class Asset extends CreationDateModel {
	@Column({ name: "type" })
	private _type: "coupon";

	@Column({ name: "is_used" })
	private _isUsed: boolean;

	@Column({ name: "value" })
	private _value: string;

	public constructor() {
		super();
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
