import { Column, Entity } from "typeorm";

import { CreationDateModel, register as Register } from "./index";
import { generateId, IdPrefix } from "../utils";
import * as moment from "moment";

@Entity({ name: "users" })
@Register
export class User extends CreationDateModel {
	protected static initializers = CreationDateModel.copyInitializers({
		id: () => generateId(IdPrefix.User)
	});

	@Column({ name: "app_id" })
	public appId: string;

	@Column({ name: "app_user_id" })
	public appUserId: string;

	@Column({ name: "wallet_address" })
	public walletAddress: string;

	@Column({ name: "activated_date", nullable: true })
	public activatedDate: Date;

	public get activated(): boolean {
		return !!this.activatedDate;
	}
}

@Entity({ name: "auth_tokens" })
@Register
export class AuthToken extends CreationDateModel {
	protected static initializers = CreationDateModel.copyInitializers({
		expireDate: () => moment().add(14, "days").toDate()
	});

	@Column({ name: "expire_date" })
	public expireDate: Date;

	@Column({ name: "device_id" })
	public deviceId: string;

	@Column({ name: "user_id" })
	public userId: string;

	@Column({ default: true })
	public valid: boolean;

	public isExpired(): boolean {
		return new Date() > this.expireDate;
	}

	public isAboutToExpire(): boolean {
		// 6 hours left
		return moment().add(6, "hours").toDate() > this.expireDate;
	}
}
