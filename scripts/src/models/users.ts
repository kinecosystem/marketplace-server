import * as moment from "moment";
import {
	Column,
	Entity,
	OneToMany,
	ManyToOne,
	JoinColumn,
	getManager,
	BaseEntity,
	PrimaryColumn,
	FindManyOptions
} from "typeorm";

import { generateId, IdPrefix, Mutable } from "../utils/utils";

import { OrderContext } from "./orders";
import { CreationDateModel, register as Register, initializer as Initializer } from "./index";
import * as metrics from "../metrics";

@Entity({ name: "users" })
@Register
@Initializer("id", () => generateId(IdPrefix.User))
// @Initializer("walletCount", () => User.DEFAULT_WALLET_COUNT)
// @Unique(["appId", "appUserId"]) // supported from 0.2.0
export class User extends CreationDateModel {
	// public static readonly DEFAULT_WALLET_COUNT = 1;

	@Column({ name: "app_id" })
	public appId!: string;

	@Column({ name: "app_user_id" })
	public appUserId!: string;

	// ECO-754: db column removed
	/*@Column({ name: "wallet_address" })
	public walletAddress!: string;*/

	@OneToMany(type => OrderContext, context => context.user)
	public contexts!: OrderContext[];

	// ECO-754: db column removed
	/*@Column({ name: "wallet_count" })
	public walletCount!: number;*/

	public async getWallets(deviceId?: string): Promise<Wallets> {
		const conditions: Partial<Mutable<Wallet>> = {
			userId: this.id
		};

		if (deviceId) {
			conditions.deviceId = deviceId;
		}

		return new Wallets(await Wallet.find(conditions));
	}

	public async updateWallet(deviceId: string, walletAddress: string): Promise<Wallet> {
		const now = new Date();
		let newWallet: boolean;
		let wallet = await Wallet.findOne({
			deviceId,
			userId: this.id,
			address: walletAddress
		});

		if (wallet) {
			newWallet = false;
			wallet.lastUsedDate = now;
		} else {
			newWallet = true;
			wallet = Wallet.create({
				deviceId,
				userId: this.id,
				createdDate: now,
				lastUsedDate: now,
				address: walletAddress
			});
		}

		metrics.walletAddressUpdate(this.appId, newWallet);
		return wallet.save();
	}

	/**
	 * Overridden save method
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

export class Wallets {
	private readonly items: Wallet[];

	constructor(items: Wallet[]) {
		this.items = items;
	}

	public get count() {
		return this.items.length;
	}

	public all(): Wallet[] {
		return this.items;
	}

	public has(address: string): boolean {
		return this.items.some(x => x.address === address);
	}

	public get(address: string): Wallet | undefined {
		return this.items.find(x => x.address === address);
	}

	public get first(): Wallet | undefined {
		return this.items[0];
	}

	public lastUsed(): Wallet | null {
		return this.count === 0 ? null : this.items.reduce((lastUsed, current) => lastUsed.lastUsedDate < current.lastUsedDate ? current : lastUsed);
	}
}

// ECO-754: table added
@Entity({ name: "user_wallets" })
@Register
export class Wallet extends BaseEntity {
	@ManyToOne(type => User)
	@JoinColumn({ name: "user_id" })
	public readonly user!: User;

	@PrimaryColumn({ name: "device_id" })
	public readonly deviceId!: string;

	@PrimaryColumn({ name: "wallet_address" })
	public readonly address!: string;

	@PrimaryColumn({ name: "user_id" })
	public readonly userId!: string;

	@Column({ name: "created_date" })
	public createdDate!: Date;

	@Column({ name: "last_used_date" })
	public lastUsedDate!: Date;

	@Column({ name: "last_earn_date", nullable: true })
	public lastEarnDate?: Date;

	@Column({ name: "last_spend_date", nullable: true })
	public lastSpendDate?: Date;
}
