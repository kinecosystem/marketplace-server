import { Column, Entity, Index, PrimaryColumn } from "typeorm";

import { CreationDateModel, Model, register as Register, initializer as Initializer } from "./index";
import { generateId, IdPrefix } from "../utils";
import { OrderMeta, Order } from "./orders";

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
export type ContentType = "poll" | "coupon";

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
	public cap!: Cap;

	@Column("simple-json")
	public meta!: OfferMeta;

	@Column()
	public type!: OfferType;

	@Column("simple-json", { name: "blockchain_data" })
	public blockchainData!: BlockchainData;

	@Column({ name: "owner_id" })
	public ownerId!: string;

	// @ManyToOne(type => OfferOwner, owner => owner.offers) // XXX requires a generated value
	public get owner(): Promise<OfferOwner | undefined> {
		return OfferOwner.findOneById(this.ownerId);
	}

	public async didExceedCap(userId: string): Promise<boolean> {
		const total = await Order.countByOffer(this.id);

		if (total >= this.cap.total) {
			return true;
		}

		const forUser = await Order.countByOffer(this.id, userId);
		if (forUser >= this.cap.per_user) {
			return true;
		}

		return false;
	}
}

@Entity({ name: "offer_contents" })
@Register
export class OfferContent extends Model {
	@PrimaryColumn({ name: "offer_id" })
	public offerId!: string;

	@Column("simple-json")
	public content!: string;

	@Column({ name: "content_type" })
	public contentType!: ContentType;
}

@Entity({ name: "app_offers" })
@Register
@Index(["offerId", "appId"], { unique: true })
export class AppOffer extends Model {
	@PrimaryColumn({ name: "offer_id" })
	public offerId!: string;

	@PrimaryColumn({ name: "app_id" })
	public appId!: string;
}

export type AssetValue = { coupon_code: string };
export type JWTValue = { jwt: string };
export type OrderValue = (JWTValue & { type: "confirm_payment" }) | (AssetValue & { type: "coupon" });

@Entity({ name: "assets" })
@Register
export class Asset extends CreationDateModel {
	@Column()
	public type!: "coupon";

	@Column({ name: "offer_id" })
	public offerId!: string;

	@Column({ name: "owner_id", nullable: true })
	public ownerId?: string;  // User.id

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
