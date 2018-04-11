import * as moment from "moment";
import { BaseEntity, Column, Entity, SelectQueryBuilder } from "typeorm";

import { generateId, IdPrefix } from "../utils";

import { CreationDateModel, register as Register, initializer as Initializer } from "./index";
import { BlockchainData, OfferType, OrderValue } from "./offers";

export type OrderMeta = {
	title: string;
	description: string;
	call_to_action?: string;
	content?: string;
};
export type OrderOrigin = "marketplace" | "application";
export type OrderStatus = "completed" | "failed" | "pending";
export type OpenOrderStatus = OrderStatus | "opened";
export type OrderStatusAndNegation = OpenOrderStatus | "!opened" | "!completed" | "!failed" | "!pending";
export type OrderError = {
	code: number;
	error: string;
	message?: string;
};

function updateQueryWithStatus(query: SelectQueryBuilder<any>, status?: OrderStatusAndNegation | null) {
	if (!status) {
		return;
	}

	if (status.startsWith("!")) {
		query.andWhere("status != :status" , { status: status.substring(1) });
	} else {
		query.andWhere("status = :status", { status });
	}
}

export type OrderStatic<T extends Order> = {
	CLASS_ORIGIN: OrderOrigin | null;

	new(): T;
	createQueryBuilder(): SelectQueryBuilder<BaseEntity>;
};

@Entity({ name: "orders" })
@Initializer("id", () => generateId(IdPrefix.Transaction))
export abstract class Order extends CreationDateModel {
	public static readonly CLASS_ORIGIN: OrderOrigin | null = null;

	/**
	 * Returns one order with the id which was passed.
	 * If `status` is passed as well, the order will be returned only if the status matches.
	 *
	 * The status can be any one of the defined statuses or one of their negation, for example:
	 * get open order with id "id1": getOne("id1", "opened")
	 * get NOT open order: getOne("id1", "!opened")
	 */
	public static getOne<T extends Order>(this: OrderStatic<T> | Function, orderId: string, status?: OrderStatusAndNegation): Promise<T | undefined> {
		const query = (this as OrderStatic<T>).createQueryBuilder()
			.where("id = :orderId", { orderId });

		updateQueryWithStatus(query, status);

		if ((this as OrderStatic<T>).CLASS_ORIGIN) {
			query.andWhere("origin = :origin", { origin: (this as OrderStatic<T>).CLASS_ORIGIN });
		}

		return query.getOne() as Promise<T | undefined>;
	}

	public static getAll<T extends Order>(this: OrderStatic<T> | Function, userId: string): Promise<T[]>;
	public static getAll<T extends Order>(this: OrderStatic<T> | Function, userId: string, limit: number): Promise<T[]>;
	public static getAll<T extends Order>(this: OrderStatic<T> | Function, userId: string, status: OrderStatusAndNegation): Promise<T[]>;
	public static getAll<T extends Order>(this: OrderStatic<T> | Function, userId: string, status: OrderStatusAndNegation, limit: number): Promise<T[]>;
	public static getAll<T extends Order>(this: OrderStatic<T> | Function, userId: string, second?: number | OrderStatusAndNegation, third?: number): Promise<T[]> {
		const status: OrderStatusAndNegation | null = typeof second === "string" ? second : null;
		const limit: number | null = typeof second === "number" ? second : (typeof third === "number" ? third : null);
		const query = (this as OrderStatic<T>).createQueryBuilder()
			.where("user_id = :userId", { userId })
			.orderBy("completion_date", "DESC")
			.addOrderBy("id", "DESC");

		updateQueryWithStatus(query, status);

		if ((this as OrderStatic<T>).CLASS_ORIGIN) {
			query.andWhere("origin = :origin", { origin: (this as OrderStatic<T>).CLASS_ORIGIN });
		}

		if (limit) {
			query.limit(limit);
		}

		return query.getMany() as Promise<T[]>;
	}

	@Column()
	public readonly origin!: OrderOrigin;

	@Column()
	public readonly type!: OfferType;

	@Column("simple-json", { name: "blockchain_data", nullable: true })
	public blockchainData?: BlockchainData;

	@Column({ name: "user_id" })
	public userId!: string;

	@Column({ name: "offer_id" })
	public offerId!: string;

	@Column("simple-json")
	public meta!: OrderMeta;

	@Column("simple-json", { nullable: true }) // the asset or JWT payment confirmation
	public value?: OrderValue;

	@Column("simple-json", { nullable: true })
	public error?: OrderError;

	@Column()
	public amount!: number;

	@Column()
	public status!: OpenOrderStatus;

	@Column({ name: "completion_date", nullable: true })
	public currentStatusDate?: Date;

	public setStatus(status: OpenOrderStatus) {
		this.status = status;
		this.currentStatusDate = new Date();
	}

	public get expirationDate(): Date | null {
		switch (this.status) {
			case "opened":
				return moment(this.createdDate).add(10, "minutes").toDate();

			case "pending":
				return moment(this.currentStatusDate).add(45, "seconds").toDate();

			default:
				return null;
		}
	}
}

@Register
@Initializer("origin", () => MarketplaceOrder.CLASS_ORIGIN)
export class MarketplaceOrder extends Order {
	public static readonly CLASS_ORIGIN = "marketplace";
}

@Register
@Initializer("origin", () => ApplicationOrder.CLASS_ORIGIN)
export class ApplicationOrder extends Order {
	public static readonly CLASS_ORIGIN = "application";

	@Column({ name: "wallet_address" })
	public readonly walletAddress!: string;
}
