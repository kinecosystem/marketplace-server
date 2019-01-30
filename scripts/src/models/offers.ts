import { Column, Entity, OneToMany, PrimaryColumn } from "typeorm";

import { CreationDateModel, initializer as Initializer, Model, register as Register } from "./index";
import { generateId, IdPrefix } from "../utils/utils";
import { OrderMeta } from "./orders";
import { OfferTranslation } from "./translations";
import { AppOffer } from "./applications";

export type BlockchainData = {
	transaction_id?: string;
	sender_address?: string;
	recipient_address?: string;
};

export type OfferMeta = {
	title: string;
	image: string;
	description: string;
	order_meta: OrderMeta;
};

export type Cap = {
	total: number;
	per_user: number;
};

export type OfferType = "spend" | "earn";
export type ContentType = "quiz" | "poll" | "tutorial" | "coupon";

@Entity({ name: "offer_owners" })
@Register
export class OfferOwner extends Model {
	@Column()
	public name!: string;

	public get offers(): Promise<Offer[]> {
		return Offer.find({ ownerId: this.id });
	}
}

@Entity({ name: "offers" })
@Register
@Initializer("id", () => generateId(IdPrefix.Offer))
export class Offer extends CreationDateModel {
	@Column({ name: "name", unique: true })
	public name!: string;

	@Column()
	public amount!: number;

	@Column("simple-json")
	public meta!: OfferMeta;

	@Column()
	public type!: OfferType;

	@Column({ name: "owner_id" })
	public ownerId!: string;

	@OneToMany(type => OfferTranslation, translation => translation.offer, {
		cascadeInsert: true,
		cascadeUpdate: true
	})
	public translations!: OfferTranslation[];

	@OneToMany(type => AppOffer, appOffer => appOffer.offer)
	public appOffers!: AppOffer[];
}

@Entity({ name: "offer_contents" })
@Register
export class OfferContent extends Model {
	@PrimaryColumn({ name: "offer_id" })
	public offerId!: string;

	@Column("simple-json")
	public content!: string; // should be object

	@Column({ name: "content_type" })
	public contentType!: ContentType;
}

export type AssetValue = { coupon_code: string };
export type JWTValue = { jwt: string };
export type OrderValue = (JWTValue & { type: "payment_confirmation" }) | (AssetValue & { type: "coupon" });

@Entity({ name: "assets" })
@Register
export class Asset extends CreationDateModel {
	@Column()
	public type!: "coupon";

	@Column({ name: "offer_id" })
	public offerId!: string;

	@Column({ name: "owner_id", nullable: true })
	public ownerId?: string; // User.id

	@Column("simple-json")
	public value!: AssetValue;

	public asOrderValue(): OrderValue {
		return Object.assign({ type: this.type }, this.value);
	}
}

@Entity({ name: "poll_answers" })
@Register
export class PollAnswer extends CreationDateModel {
	@Column({ name: "user_id" })
	public userId!: string;

	@Column({ name: "offer_id" })
	public offerId!: string;

	@Column({ name: "order_id" })
	public orderId!: string;

	@Column()
	public content!: string;
}
