import { BaseEntity, Column, Entity, JoinColumn, ManyToOne, ObjectType, OneToMany, PrimaryColumn } from "typeorm";
import { register as Register } from "./index";
import { DeepPartial } from "typeorm/common/DeepPartial";
import { Offer } from "./offers";

@Entity({ name: "offer_content_translations" })
@Register
export class OfferTranslation extends BaseEntity {
	public static new(this: ObjectType<OfferTranslation>, data?: DeepPartial<OfferTranslation>): OfferTranslation {
		return (this as typeof BaseEntity).create(data!) as OfferTranslation;
	}

	@ManyToOne(type => Offer, offer => offer.id)
	@JoinColumn({ name: "offer_id" })
	public readonly offer!: Offer;

	@PrimaryColumn()
	public readonly context!: string;

	@PrimaryColumn()
	public readonly path!: string;

	@PrimaryColumn()
	public readonly language!: string;

	@Column()
	public readonly translation!: string;

	@PrimaryColumn({ name: "offer_id" })
	public readonly offerId?: string;
}
