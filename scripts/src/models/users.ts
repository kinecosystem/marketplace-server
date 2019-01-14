import * as moment from "moment";
import {
	Column,
	Entity,
	OneToMany,
	getManager
} from "typeorm";

import { generateId, IdPrefix } from "../utils/utils";

import { OrderContext } from "./orders";
import { CreationDateModel, register as Register, initializer as Initializer } from "./index";

@Entity({ name: "users" })
@Register
@Initializer("id", () => generateId(IdPrefix.User))
@Initializer("walletCount", () => User.DEFAULT_WALLET_COUNT)
// @Unique(["appId", "appUserId"]) // supported from 0.2.0
export class User extends CreationDateModel {
	public static readonly DEFAULT_WALLET_COUNT = 1;

	@Column({ name: "app_id" })
	public appId!: string;

	@Column({ name: "app_user_id" })
	public appUserId!: string;

	@Column({ name: "wallet_address" })
	public walletAddress!: string;

	@OneToMany(type => OrderContext, context => context.user)
	public contexts!: OrderContext[];

	@Column({ name: "wallet_count" })
	public walletCount!: number;

	/**
	 * Overrided save method
	 * If this (user) is new, it calls direct insert method instead of built-in upsert TypeORM functionality
	 * It generates id and tries to insert it to the table, up to 3 tries, and breaks the loops on success
	 */
	public async save(): Promise<this> {
		if (!this.isNew) { return await super.save(); }

		let errorCount = 0;
		const triesCount = 3;
		while (true) {
			if (errorCount > triesCount) { throw new Error(`user generated with the same id more than ${ triesCount } times or some another error`); }

			try { // tries to insert a new user with generated id
				await getManager()
					.createQueryBuilder()
					.insert()
					.into(User)
					.values([ this ])
					.execute();
				break; // breaks the while loop in case of success
			} catch (e) {
				this.id = generateId(IdPrefix.User);
				errorCount++;
			}
		}
		return this;
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
