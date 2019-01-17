import { BaseEntity, Column, Entity, JoinColumn, ManyToOne, ObjectType, OneToMany, PrimaryColumn } from "typeorm";
import { register as Register } from "./index";
import { DeepPartial } from "typeorm/common/DeepPartial";
import { Offer } from "./offers";

export type GetTranslationsCriteria = {
	languages?: string[];
	offerId?: string;
	paths?: string[];
};

const CACHE = new Map<string, OfferTranslation[]>();

@Entity({ name: "offer_content_translations" })
@Register
export class OfferTranslation extends BaseEntity {
	public static new(this: ObjectType<OfferTranslation>, data?: DeepPartial<OfferTranslation>): OfferTranslation {
		return (this as typeof BaseEntity).create(data!) as OfferTranslation;
	}

	public static async getTranslations(criteria: GetTranslationsCriteria = {}): Promise<OfferTranslation[]> {
		//  todo add cache
		const cacheKey = `${criteria.languages}:${criteria.offerId}:${criteria.paths}`;
		const languages = criteria.languages;
		const offerId = criteria.offerId;
		const paths = criteria.paths;

		if (CACHE.has(cacheKey)) {
			return CACHE.get(cacheKey) as OfferTranslation[];
		}

		const query = OfferTranslation.createQueryBuilder("translations");
		if (languages && languages.length > 0) {
			query.where("translations.language IN (:languages)", { languages });
		}
		if (offerId) {
			query.andWhere("translations.offerId = :offerId", { offerId });
		}
		if (paths && paths.length > 0) {
			query.andWhere("translations.path IN (:paths)", { paths });
		}
		const results = await query.getMany();
		CACHE.set(cacheKey, results);
		return results;
	}

	public static async getSupportedLanguages(criteria: GetTranslationsCriteria = {}): Promise<[string[], OfferTranslation[]]> {
		const translations = await OfferTranslation.getTranslations(criteria);
		const languages = new Set(translations.map(translation => translation.language));
		return [Array.from(languages), translations];
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
