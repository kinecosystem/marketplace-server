import { generateId, IdPrefix } from "../utils";
import { Column, Entity, Index, JoinTable, ManyToMany } from "typeorm";
import { CreationDateModel, Model, register as Register, initializer as Initializer } from "./index";
import { Offer } from "./offers";

export type StringMap = { [key: string]: string; };  // key => value pairs

@Entity({ name: "applications" })
@Register
@Initializer("apiKey", () => generateId(IdPrefix.App))
export class Application extends CreationDateModel {
	// XXX testing purposes
	public static SAMPLE_API_KEY = "A28hNcn2wp77QyaM8kB2C";

	@Column({ name: "name" })
	public name!: string;

	@Column({ name: "api_key" })
	public apiKey!: string;

	@Column("simple-json", { name: "jwt_public_keys" })
	public jwtPublicKeys!: StringMap;

	@ManyToMany(type => Offer)
	@JoinTable()
	public offers: Offer[] = [];
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
