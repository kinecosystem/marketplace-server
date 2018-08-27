import { generateId, IdPrefix } from "../utils";
import { Column, Entity, Index, JoinTable, ManyToMany } from "typeorm";
import { CreationDateModel, register as Register, initializer as Initializer } from "./index";
import { Offer } from "./offers";

export type StringMap = { [key: string]: string; };  // key => value pairs
export type SignInType = "jwt" | "whitelist";
export type ApplicationConfig = {
	max_user_wallets: number | null;
	sign_in_types: SignInType[];
};

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

	@ManyToMany(type => Offer)
	@JoinTable()
	public offers: Offer[] = [];

	public supportsSignInType(type: SignInType, globalSignInTypes: SignInType[]) {
		return globalSignInTypes.includes(type) && this.config.sign_in_types.includes(type);
	}

	public allowsNewWallet(currentNumberOfWallets: number) {
		return this.config.max_user_wallets === null || currentNumberOfWallets < this.config.max_user_wallets;
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
