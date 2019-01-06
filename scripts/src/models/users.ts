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
// @Unique(["appId", "appUserId"]) // supported from 0.2.0
export class User extends CreationDateModel {
	@Column({ name: "app_id" })
	public appId!: string;

	@Column({ name: "app_user_id" })
	public appUserId!: string;

	@Column({ name: "wallet_address" })
	public walletAddress!: string;

	@OneToMany(type => OrderContext, context => context.user)
	public contexts!: OrderContext[];

	@Column({ name: "wallet_count", default: 1 })
	public walletCount!: number;

	public async save(): Promise<this> {
		let errorCount = 0;
		while (true) {
			if (errorCount > 3) { break; }
			console.log("errorCount: ", errorCount);

			try {
				/**
				 * tries to insert a new user with generated id
				 */
				await getManager()
					.createQueryBuilder()
					.insert()
					.into(User)
					.values([{
						id: this.id,
						appId: this.appId,
						appUserId: this.appUserId,
						walletAddress: this.walletAddress,
						walletCount: this.walletCount, // possibly null
						createdDate: this.createdDate, // possibly null
					}])
					.execute();
				break; // breaks the while loop in case of success
			} catch (e) {
				console.log(e.message);
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
