import { Column, Entity, OneToMany, PrimaryColumn } from "typeorm";

import { CreationDateModel, initializer as Initializer, Model, register as Register } from "./index";
import { generateId, IdPrefix } from "../utils/utils";
import { OrderMeta } from "./orders";
import { OfferTranslation } from "./translations";
import { AppOffer } from "./applications";
import { localCache } from "../utils/cache";

export type BlockchainData = {
	transaction_id?: string;
	sender_address?: string;
	recipient_address?: string;
	memo?: string;
};

export type BlockchainVersion = "2" | "3";
export const BlockchainVersionValues = ["2", "3"] as BlockchainVersion[];

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
	public static async get(id: string): Promise<Offer | undefined> {
		const cacheKey = `offer:${ id }`;
		let offer = localCache.get<Offer>(cacheKey) || undefined;

		if (!offer) {
			offer = await Offer.findOneById(id);

			if (offer) {
				localCache.set(cacheKey, offer);
			}
		}

		return offer;
	}

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
	public static async get(offerId: string): Promise<OfferContent | undefined> {
		return (await this.all()).get(offerId);
	}

	public static async all(): Promise<Map<string, OfferContent>> {
		const cacheKey = "offer_contents";
		let contents = localCache.get<OfferContent[]>(cacheKey);

		if (!contents) {
			contents = await OfferContent.find();
			localCache.set(cacheKey, contents);
		}

		return new Map(contents.map(content => [content.offerId, content]) as Array<[string, OfferContent]>);
	}

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

@Entity({ name: "sdk_version_rules" })
@Register
export class SdkVersionRule extends CreationDateModel {

	@PrimaryColumn({ name: "comparator" })
	public comparator!: string;

	@PrimaryColumn({ name: "asset_type" })
	public assetType!: string;

	@Column({ name: "data", type: "json" })
	public data!: string;
}
