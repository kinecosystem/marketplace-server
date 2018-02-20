import { Column, Entity, Index, PrimaryColumn } from "typeorm";

import { CreationDateModel, Model, register } from "./index";
import { IdPrefix } from "../utils";

export type OfferMeta = {
	title: string;
	image: string;
	description: string;
};

export type OfferType = "spend" | "earn";

@Entity()
@register
export class Offer extends CreationDateModel {
	@Column()
	public amount: number;

	@Column("simple-json")
	public cap: any;

	@Column("simple-json")
	public meta: OfferMeta;

	@Column()
	public type: OfferType;

	@Column({ name: "owner_id" })
	public ownerId: string;

	public constructor() {
		super(IdPrefix.Offer);
	}
}

@Entity()
@register
@Index(["offerId", "content"], { unique: true })
export class OfferContent extends Model {
	@PrimaryColumn({ name: "offer_id" })
	public offerId: string;

	@PrimaryColumn()
	public content: string;

	public constructor() {
		super();
	}
}

@Entity()
@register
export class OfferOwner extends Model {
	@Column()
	public name: string;

	public constructor() {
		super();
	}
}

@Entity()
@register
@Index(["offerId", "appId"], { unique: true })
export class AppOffer extends Model {
	@PrimaryColumn({ name: "offer_id" })
	public offerId: string;

	@PrimaryColumn({ name: "app_id" })
	public appId: string;

	public constructor() {
		super();
	}
}

@Entity()
@register
export class Asset extends CreationDateModel {
	@Column()
	public type: "coupon";

	@Column({ name: "is_used" })
	public isUsed: boolean;

	@Column("simple-json")
	public value: any;

	public constructor() {
		super();
	}
}
