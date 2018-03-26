import { Column, Entity } from "typeorm";

import { CreationDateModel, register as Register, initializer as Initializer } from "./index";
import { generateId, IdPrefix } from "../utils";
import * as moment from "moment";

@Entity({ name: "users" })
@Register
@Initializer("id", () => generateId(IdPrefix.User))
export class User extends CreationDateModel {
	@Column({ name: "app_id" })
	public appId!: string;

	@Column({ name: "app_user_id" })
	public appUserId!: string;

	@Column({ name: "wallet_address" })
	public walletAddress!: string;

	@Column({ name: "activated_date", nullable: true })
	public activatedDate?: Date;

	public get activated(): boolean {
		return !!this.activatedDate;
	}
}

@Entity({ name: "auth_tokens" })
@Register
@Initializer("expireDate", () => moment().add(14, "days").toDate())
export class AuthToken extends CreationDateModel {
	@Column({ name: "expire_date" })
	public expireDate!: Date;

	@Column({ name: "device_id" })
	public deviceId!: string;

	@Column({ name: "user_id" })
	public userId!: string;

	@Column({ default: true })
	public valid!: boolean;

	public isExpired(): boolean {
		return new Date() > this.expireDate;
	}

	public isAboutToExpire(): boolean {
		// 6 hours left
		return moment().add(6, "hours").toDate() > this.expireDate;
	}
}
