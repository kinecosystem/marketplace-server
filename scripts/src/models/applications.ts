import { generateId, IdPrefix } from "../utils/utils";
import {
	BaseEntity,
	Column,
	Entity,
	Index,
	JoinColumn,
	JoinTable,
	ManyToMany,
	ManyToOne,
	OneToMany,
	PrimaryColumn
} from "typeorm";
import { CreationDateModel, register as Register, initializer as Initializer } from "./index";
import { Cap, Offer, OfferType } from "./offers";
import { Model } from "sequelize";
import { Order, OrderContext } from "./orders";

export type StringMap = { [key: string]: string; };  // key => value pairs
export type SignInType = "jwt" | "whitelist";
export type ApplicationConfig = {
	max_user_wallets: number | null;
	sign_in_types: SignInType[];
	limits: {
		hourly_registration: number,
		minute_registration: number,
		hourly_total_earn: number,
		minute_total_earn: number,
		hourly_user_earn: number,
	}
};

const AppOffersCache = new Map<string, AppOffer[]>();

@Entity({ name: "applications" })
@Initializer("apiKey", () => generateId(IdPrefix.App))
@Register
export class Application extends CreationDateModel {
	// XXX testing purposes
	public static SAMPLE_API_KEY = "A28hNcn2wp77QyaM8kB2C";

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

	public supportsSignInType(type: SignInType, globalSignInTypes: SignInType[]) {
		return globalSignInTypes.includes(type) && this.config.sign_in_types.includes(type);
	}

	public allowsNewWallet(currentNumberOfWallets: number) {
		return this.config.max_user_wallets === null || currentNumberOfWallets < this.config.max_user_wallets;
	}
}

@Entity({ name: "application_offers" })
@Register
export class AppOffer extends BaseEntity {
	public static async getAppOffers(appId: string, type: OfferType): Promise<AppOffer[]> {
		// XXX add cache
		const cacheKey = `appOffers:${appId}:${type}`;
		// if (AppOffersCache.has(cacheKey)) {
		// 	return AppOffersCache.get(cacheKey) as AppOffer[];
		// }

		const results = await AppOffer.createQueryBuilder("app_offer")
			.leftJoinAndSelect("app_offer.offer", "offer")
			.where("app_id = :appId", { appId })
			.andWhere("offer.type = :type", { type })
			.orderBy("offer.amount", type === "earn" ? "DESC" : "ASC")
			.addOrderBy("offer.id", "ASC")
			.getMany();
		// AppOffersCache.set(cacheKey, results);
		return results;
	}

	@PrimaryColumn({ name: "app_id" })
	public appId!: string;

	@PrimaryColumn({ name: "offer_id" })
	public offerId!: string;

	@Column("simple-json")
	public cap!: Cap;

	@Column({ name: "wallet_address" })
	public walletAddress!: string;

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

		const forUser = (await Order.countAllByOffer(this.appId, { offerId: this.offerId, userId })).get(this.offerId) || 0;
		if (forUser >= this.cap.per_user) {
			return true;
		}

		return false;
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
