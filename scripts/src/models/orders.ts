import * as moment from "moment";
import { DeepPartial } from "typeorm/common/DeepPartial";
import { BaseEntity, Brackets, Column, Entity, getManager, SelectQueryBuilder } from "typeorm";

import { generateId, IdPrefix } from "../utils";

import { CreationDateModel, initializer as Initializer, register as Register } from "./index";
import { BlockchainData, OfferType, OrderValue } from "./offers";
import { ApiError } from "../errors";

export interface OrderMeta {
	title: string;
	description: string;
	call_to_action?: string;
	content?: string;
}

export type OrderOrigin = "marketplace" | "external";
export type OrderStatus = "completed" | "failed" | "pending";
export type OpenOrderStatus = OrderStatus | "opened";
export type OrderStatusAndNegation = OpenOrderStatus | "!opened" | "!completed" | "!failed" | "!pending";

function updateQueryWithStatus(query: SelectQueryBuilder<any>, status?: OrderStatusAndNegation | null) {
	if (!status) {
		return;
	}

	if (status.startsWith("!")) {
		query.andWhere("status != :status", { status: status.substring(1) });
	} else {
		query.andWhere("status = :status", { status });
	}
}

function updateQueryWithFilter(query: SelectQueryBuilder<any>, name: string, value?: string | null) {
	if (!value) {
		return;
	}

	if (value.startsWith("!")) {
		query.andWhere(`${ name } != :value`, { value: value.substring(1) });
	} else {
		query.andWhere(`${ name } = :value`, { value });
	}
}

export type OrderStatic<T extends Order = Order> = {
	CLASS_ORIGIN: OrderOrigin | null;

	new(): T;
	createQueryBuilder(): SelectQueryBuilder<BaseEntity>;
};

export type GetOrderFilters = {
	userId: string;
	offerId?: string;
	origin?: OrderOrigin;
	status?: OrderStatusAndNegation;
};

@Entity({ name: "orders" })
@Initializer("id", () => generateId(IdPrefix.Transaction))
@Initializer("expirationDate", () => moment().add(10, "minutes").toDate()) // opened expiration
@Initializer("currentStatusDate", () => moment().toDate())
@Register
export class Order extends CreationDateModel {
	/**
	 * count all offers that are completed, pending but not expired, opened but not expired - i.e. not failed and not expired
	 */
	public static countByOffer(offerId: string, userId?: string): Promise<number> {
		const statuses = userId ? ["pending"] : ["opened", "pending"];

		const query = Order.createQueryBuilder()
			.where("offer_id = :offerId", { offerId })
			.andWhere(new Brackets(qb => {
				qb.where("status = :status", { status: "completed" })
					.orWhere(
						new Brackets(qb2 => {
							qb2.where("status IN (:statuses)", { statuses })
								.andWhere("expiration_date > :date", { date: new Date() });
						})
					);
			}));
		if (userId) {
			query.andWhere("user_id = :userId", { userId });
		}
		return query.getCount();
	}

	public static async countAllByOffer(userId: string): Promise<Map<string, number>> {
		const results: Array<{ offer_id: string, cnt: number }> = await getManager().query(
			`SELECT offer_id, COUNT(DISTINCT("Order"."id")) as "cnt"
		FROM "orders" "Order"
		WHERE (status = $1 OR (status IN ($2) AND expiration_date > $3))
		AND user_id = ($4)
		group by offer_id`, ["completed", ["pending"], new Date(), userId]);
		const map = new Map<string, number>();
		for (const res of results) {
			map.set(res.offer_id, res.cnt);
		}
		return map;
	}

	public static countToday(userId: string, type: OfferType): Promise<number> {
		const midnight = new Date((new Date()).setUTCHours(0, 0, 0, 0));
		const query = Order.createQueryBuilder()
			.where("user_id = :userId", { userId })
			.andWhere("type = :type", { type })
			.andWhere("current_status_date > :midnight", { midnight })
			.andWhere(new Brackets(qb => {
				qb.where("status = :completed", { completed: "completed" })
					.orWhere(
						new Brackets(qb2 => {
							qb2.where("status = :pending", { pending: "pending" })
								.andWhere("expiration_date > :expiration_date", { expiration_date: new Date() });
						})
					);
			}));
		return query.getCount();

	}

	public static getOpenOrder<T extends Order>(offerId: string, userId: string): Promise<T | undefined> {
		// has at least 2 minutes to complete before expiration
		const latestExpiration = moment().add(2, "minutes").toDate();
		const query = Order.createQueryBuilder()
			.where("offer_id = :offerId", { offerId })
			.andWhere("status = :status", { status: "opened" })
			.andWhere("user_id = :userId", { userId })
			.andWhere("expiration_date > :date", { date: latestExpiration })
			.orderBy("expiration_date", "DESC"); // if there are a few, get the one with the most time left

		return query.getOne() as Promise<T | undefined>;
	}

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

	public static getAll<T extends Order>(this: OrderStatic<T> | Function, filters: GetOrderFilters, limit?: number): Promise<T[]> {
		const query = (this as OrderStatic<T>).createQueryBuilder()
			.where("user_id = :userId", { userId: filters.userId })
			.orderBy("current_status_date", "DESC")
			.addOrderBy("id", "DESC");

		// updateQueryWithStatus(query, filters.status);
		updateQueryWithFilter(query, "status", filters.status);
		updateQueryWithFilter(query, "origin", filters.origin);
		updateQueryWithFilter(query, "offer_id", filters.offerId);

		/**
		 * In case `filters` doesn't contain the `origin`, include the origin of the extending class.
		 * So, when doing:
		 *  MarketplaceOrder.getAll({ userId: "..."})
		 * It will add `origin: "marketplace"` to the filters.
		 *
		 * When doing:
		 *  ExternalOrder.getAll({ userId: "..."})
		 * It will add `origin: "external"` to the filters.
		 *
		 * When doing:
		 *  Order.getAll({ userId: "..."})
		 * No origin is added
		 */
		if (!filters.origin && (this as OrderStatic<T>).CLASS_ORIGIN) {
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
	public type!: OfferType;

	@Column("simple-json", { name: "blockchain_data", nullable: true })
	public blockchainData!: BlockchainData;

	@Column({ name: "user_id" })
	public userId!: string;

	@Column({ name: "offer_id" })
	public offerId!: string;

	@Column("simple-json")
	public meta!: OrderMeta;

	@Column("simple-json", { nullable: true })
	public error?: ApiError | null;

	@Column()
	public amount!: number;

	@Column()
	public status!: OpenOrderStatus;

	@Column({ name: "current_status_date" })
	public currentStatusDate!: Date;

	@Column("simple-json", { nullable: true })
	public value?: OrderValue;

	@Column({ name: "expiration_date", nullable: true })
	public expirationDate?: Date;

	public setStatus(status: OpenOrderStatus) {
		this.status = status;
		this.currentStatusDate = new Date();
		switch (this.status) {
			case "pending":
				this.expirationDate = moment(this.currentStatusDate).add(45, "seconds").toDate();
				break;
			case "opened":
				this.expirationDate = moment(this.currentStatusDate).add(10, "minutes").toDate();
				break;
			default:
				this.expirationDate = null as any;
		}
	}

	public isExpired(): boolean {
		if (this.expirationDate) {
			return this.expirationDate < new Date();
		}
		return false;
	}

	public isExternalOrder() {
		return this.origin === "external";
	}

	public isMarketplaceOrder() {
		return this.origin === "marketplace";
	}
}

export type MarketplaceOrder = Order;

export const MarketplaceOrder = {
	ORIGIN: "marketplace",
	"new"(data?: DeepPartial<Order>): MarketplaceOrder {
		const instance = Order.new(data) as MarketplaceOrder;
		(instance as any).origin = MarketplaceOrder.ORIGIN;
		return instance;
	}
};

export type ExternalOrder = Order;

export const ExternalOrder = {
	ORIGIN: "external",
	"new"(data?: DeepPartial<Order>): ExternalOrder {
		const instance = Order.new(data) as ExternalOrder;
		(instance as any).origin = ExternalOrder.ORIGIN;

		return instance;
	}
};
