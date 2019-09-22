import { generateId, IdPrefix, isNothing } from "../utils/utils";
import { localCache } from "../utils/cache";
import { BaseEntity, Column, Entity, Index, JoinColumn, ManyToOne, OneToMany, PrimaryColumn } from "typeorm";
import { CreationDateModel, initializer as Initializer, register as Register } from "./index";
import { Cap, Offer, OfferType, BlockchainVersion } from "./offers";
import { Order } from "./orders";

import { LimitConfig } from "../config";
import moment = require("moment");
import { getConfig } from "../public/config";

const config = getConfig();

export type StringMap = { [key: string]: string; };  // key => value pairs
export type SignInType = "jwt" | "whitelist";
export type ApplicationConfig = {
	max_user_wallets: number | null;
	daily_earn_offers: number;
	sign_in_types: SignInType[];
	limits: LimitConfig;
	blockchain_version: BlockchainVersion;
	bulk_user_creation_allowed?: number;
	gradual_migration_date?: string | null;  // ISO date format with TZ, i.e. 2010-12-21T10:22:33Z
	gradual_migration_jwt_users_limit?: number | null;  // ISO date format with TZ, i.e. 2010-12-21T10:22:33Z
};

@Entity({ name: "applications" })
@Initializer("apiKey", () => generateId(IdPrefix.App))
@Register
export class Application extends CreationDateModel {
	// XXX testing purposes
	public static SAMPLE_API_KEY = "A28hNcn2wp77QyaM8kB2C";

	public static async all(): Promise<Map<string, Application>> {
		const cacheKey = "apps";
		let apps = localCache.get<Application[]>(cacheKey);

		// if (!apps) {
		if (true) {
			apps = await Application.find();
			// localCache.set(cacheKey, apps, moment.duration(config.cache_ttl.application, "seconds"));
		}

		return new Map(apps.map(app => [app.id, app]) as Array<[string, Application]>);
	}

	public static async get(id: string): Promise<Application | undefined> {
		return (await this.all()).get(id);
	}

	@Column({ name: "name" })
	public name!: string;

	@Column({ name: "api_key" })
	public apiKey!: string;

	@Column("simple-json", { name: "jwt_public_keys" })
	public jwtPublicKeys!: StringMap;

	@Column("simple-json", { name: "wallet_addresses" })
	public walletAddresses!: { recipient: string; sender: string };

	@Column("simple-json", { name: "config" })
	public config!: ApplicationConfig;

	@OneToMany(type => AppOffer, appOffer => appOffer.app)
	public appOffers!: AppOffer[];

	public supportsSignInType(type: SignInType) {
		return this.config.sign_in_types.includes(type);
	}

	public allowsNewWallet(currentNumberOfWallets: number) {
		return this.config.max_user_wallets === null || currentNumberOfWallets < this.config.max_user_wallets;
	}

	// return true if should apply gradual migration from given date
	// if no date given, use now
	public shouldApplyGradualMigration(date?: Date): boolean {
		if (isNothing(this.config.gradual_migration_date)) {
			return false;
		}
		const compareTo = moment(date || new Date());
		// given date is after the migration date - should migrate
		return compareTo > moment(this.config.gradual_migration_date);
	}
}

@Entity({ name: "application_offers" })
@Register
export class AppOffer extends BaseEntity {
	public static async getAppOffers(appId: string, type: OfferType): Promise<AppOffer[]> {
		const cacheKey = `appOffers:${ appId }:${ type }`;
		let appOffers = localCache.get<AppOffer[]>(cacheKey);

		if (!appOffers) {
			appOffers = await AppOffer.createQueryBuilder("app_offer")
				.leftJoinAndSelect("app_offer.offer", "offer")
				.leftJoinAndSelect("app_offer.app", "app")
				.where("app_offer.appId = :appId", { appId })
				.andWhere("offer.type = :type", { type })
				.orderBy("app_offer.sortIndex", "ASC")
				.getMany();
			localCache.set(cacheKey, appOffers);
		}

		return appOffers;
	}

	public static async generate(appId: string, offerId: string, cap: Cap, walletAddress: string): Promise<AppOffer> {
		const lastAppOffer = await AppOffer.findOne({ where: { appId }, order: { sortIndex: "DESC" } });
		const orderingBufferStep = 10;
		const lastAppOfferOrdering = (lastAppOffer && lastAppOffer.sortIndex) ? Number(lastAppOffer.sortIndex) : 0;
		const newAppOfferOrdering = lastAppOfferOrdering + 1 * orderingBufferStep;
		return await AppOffer.create({ appId, offerId, cap, walletAddress, sortIndex: newAppOfferOrdering });
	}

	@PrimaryColumn({ name: "app_id" })
	public appId!: string;

	@PrimaryColumn({ name: "offer_id" })
	public offerId!: string;

	@Column("simple-json")
	public cap!: Cap;

	@Column({ name: "wallet_address" })
	public walletAddress!: string;

	@Column({ name: "sort_index", type: "int" })
	public sortIndex!: number;

	@ManyToOne(type => Offer, { eager: true })
	@JoinColumn({ name: "offer_id" })
	public readonly offer!: Offer;

	@ManyToOne(type => Application, app => app.appOffers)
	@JoinColumn({ name: "app_id" })
	public readonly app!: Application;

	public async didExceedCap(userId: string): Promise<boolean> {
		// const total = (await Order.countAllByOffer(this.appId, { offerId: this.offerId })).get(this.offerId) || 0;
		// if (total >= this.cap.total) {
		// 	return true;
		// }
		const forUser = (await Order.countAllByOffer(this.appId, {
			offerId: this.offerId,
			userId
		})).get(this.offerId) || 0;
		return forUser >= this.cap.per_user;
	}
}

@Entity({ name: "app_whitelists" })
@Index(["appId", "appUserId"], { unique: true })
@Register
export class AppWhitelists extends CreationDateModel {
	@Column({ name: "app_id" })
	public appId!: string;

	@Column({ name: "app_user_id" })
	public appUserId!: string;
}
