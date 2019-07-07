import * as moment from "moment";
import {
	Column,
	Entity,
	OneToMany,
	ManyToOne,
	JoinColumn,
	getManager,
	BaseEntity,
	PrimaryColumn
} from "typeorm";
import { getDefaultLogger as logger } from "../logging";
import { cached, generateId, IdPrefix, Mutable } from "../utils/utils";

import { OrderContext } from "./orders";
import { CreationDateModel, register as Register, initializer as Initializer } from "./index";
import { BlockchainVersion } from "./offers";
import { getRedisClient } from "../redis";

@Entity({ name: "users" })
@Register
@Initializer("id", () => generateId(IdPrefix.User))
@Initializer("walletCount", () => 0)
// @Unique(["appId", "appUserId"]) // supported from 0.2.0
export class User extends CreationDateModel {
	@Column({ name: "app_id" })
	public appId!: string;

	@Column({ name: "app_user_id" })
	public appUserId!: string;

	@OneToMany(type => OrderContext, context => context.user)
	public contexts!: OrderContext[];

	@Column({ name: "wallet_count" })
	public walletCount!: number;

	@Column({ name: "wallet_address", nullable: true })
	public walletAddress!: string;

	public async getWallets(deviceId?: string): Promise<Wallets> {
		const conditions: Partial<Mutable<Wallet>> = {
			userId: this.id
		};

		if (deviceId) {
			conditions.deviceId = deviceId;
			const wallets = await Wallet.find(conditions);
			if (wallets.length) {
				return new Wallets(wallets);
			} // else delete deviceId and let find generic wallets
			delete conditions.deviceId;
		}

		let wallets = await Wallet.find(conditions);
		if (wallets.length === 0 && this.walletAddress) {
			await this.lazyMigrateWallet(deviceId);
			wallets = await Wallet.find(conditions);
		}
		return new Wallets(wallets);
	}

	public async updateWallet(deviceId: string, walletAddress: string): Promise<boolean> {
		const now = new Date();
		let isNewWallet: boolean;
		let wallet = await Wallet.findOne({
			deviceId,
			userId: this.id,
			address: walletAddress
		});

		if (wallet) {
			isNewWallet = false;
			wallet.lastUsedDate = now;
		} else {
			isNewWallet = true;
			wallet = Wallet.create({
				deviceId,
				userId: this.id,
				createdDate: now,
				lastUsedDate: now,
				address: walletAddress,
			});
		}

		try {
			await wallet.save();
			return isNewWallet;
		} catch (e) {
			// might catch a "violates unique constraint" error, check by finding the wallet again
			wallet = await Wallet.findOne({
				deviceId,
				userId: this.id,
				address: walletAddress
			});
			if (wallet) {
				logger().warn("solved user registration race condition");
				return false;
			} // otherwise throw
			throw e;
		}
	}

	/**
	 * Overridden save method
	 * If this (user) is new, it calls direct insert method instead of built-in upsert TypeORM functionality
	 * It generates id and tries to insert it to the table, up to 3 tries, and breaks the loops on success
	 */
	public async save(): Promise<this> {
		if (!this.isNew) {
			return await super.save();
		}

		let errorCount = 0;
		const triesCount = 3;
		while (true) {
			if (errorCount > triesCount) {
				throw new Error(`user generated with the same id more than ${ triesCount } times or some another error`);
			}

			try { // tries to insert a new user with generated id
				await getManager()
					.createQueryBuilder()
					.insert()
					.into(User)
					.values([this])
					.execute();
				break; // breaks the while loop in case of success
			} catch (e) {
				this.id = generateId(IdPrefix.User);
				errorCount++;
			}
		}
		return this;
	}

	// migrate wallet from user table to user_wallets
	private async lazyMigrateWallet(deviceId?: string) {
		if (!deviceId) {
			const token = await AuthToken.findOne({
				where: { userId: this.id },
				order: { createdDate: "DESC" }
			});
			if (!token) {
				return;
			}
			deviceId = token.deviceId;
		}
		logger().info(`lazy migrate user ${ this.id } device ${ deviceId } wallet: ${ this.walletAddress }`);
		await this.updateWallet(deviceId, this.walletAddress);
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
		this.items = Array.from(new Set(items));
	}

	public get count() {
		return new Set(this.items.map(w => w.address)).size;
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
		return this.count === 0 ? null : this.items.reduce(
			(lastUsed, current) => lastUsed.lastUsedDate < current.lastUsedDate ? current : lastUsed);
	}
}

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

@Entity({ name: "wallet_application" })
@Register
export class WalletApplication extends BaseEntity {
	public static async updateCreatedDate(walletAddress: string, blockchainVersion: BlockchainVersion) {
		const createdDateField = blockchainVersion === "2" ? "createdDateKin2" : "createdDateKin3";
		await WalletApplication.update({ walletAddress }, { [createdDateField]: new Date() });
		(WalletApplication.get as any).clear(walletAddress);
	}

	public static async getBlockchainVersion(walletAddress: string): Promise<BlockchainVersion> {
		const wallet = await WalletApplication.get(walletAddress);
		if (wallet && wallet.createdDateKin3) {
			return "3";
		}
		return "2";
	}

	@cached(getRedisClient(), (walletAddress: string) => `wallet_app:2:${ walletAddress }`, moment.duration(10, "minute").asSeconds())
	public static async get(walletAddress: string): Promise<WalletApplication | undefined> {
		return await WalletApplication.findOneById(walletAddress);
	}

	@PrimaryColumn({ name: "wallet_address" })
	public walletAddress!: string;

	@Column({ name: "app_id" })
	public appId!: string;

	@Column({ name: "created_date_kin2", nullable: true })
	public createdDateKin2?: Date;

	@Column({ name: "created_date_kin3", nullable: true })
	public createdDateKin3?: Date;
}

@Entity({ name: "gradual_migration_users" })
@Register
export class GradualMigrationUser extends BaseEntity {
	public static async addList(appId: string, appUserIds: string[]): Promise<void> {
		const BATCH_SIZE = 500;
		for (let i = 0; i < appUserIds.length; i += BATCH_SIZE) {
			// translate apUserId to userId and insert to table
			const users: Array<{ id: string }> = await User
				.createQueryBuilder("user")
				.select("id")
				.where("user.appUserId IN (:appUserIds)", { appUserIds: appUserIds.slice(i, i + BATCH_SIZE) })
				.andWhere("user.appId = :appId", { appId })
				.getRawMany();
			const userIds = users.map(u => ({ userId: u.id }));

			if (userIds.length) {
				await GradualMigrationUser
					.createQueryBuilder()
					.insert()
					.values(userIds)
					.onConflict(`("user_id") DO NOTHING`)
					.execute();
			}
		}
	}

	public static async setAsMigrated(userIds: string[]): Promise<void> {
		logger().info(`setting migration users ${ userIds }`);
		await GradualMigrationUser
			.createQueryBuilder("mig")
			.update(GradualMigrationUser)
			.set({ migrationDate: () => "CURRENT_TIMESTAMP" })
			.whereInIds(userIds)
			.execute();
	}

	public static async findByWallet(walletAddress: string): Promise<GradualMigrationUser[]> {
		const wallets = await Wallet.find({ select: ["userId"], where: { address: walletAddress } });
		const userIds = wallets.map(w => w.userId);
		return await GradualMigrationUser.findByIds(userIds);
	}

	@PrimaryColumn({ name: "user_id" })
	public userId!: string;

	@Column({ name: "migration_date", nullable: true })
	public migrationDate?: Date; // flag that marks this user has been requested to migrate

	@Column({ name: "created_date", nullable: false, default: () => "CURRENT_TIMESTAMP" })
	public createdDate!: Date; // flag that marks this user has been requested to migrate
}
