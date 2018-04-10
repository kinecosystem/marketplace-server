import * as moment from "moment";
import { Column, Entity, SelectQueryBuilder } from "typeorm";

import { generateId, IdPrefix } from "../utils";

import { CreationDateModel, register as Register, initializer as Initializer } from "./index";
import { BlockchainData, OfferType, OrderValue } from "./offers";

export type OrderMeta = {
	title: string;
	description: string;
	call_to_action?: string;
	content?: string;
};
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

@Entity({ name: "orders" })
@Register
@Initializer("id", () => generateId(IdPrefix.Transaction))
export class Order extends CreationDateModel {
	/**
	 * Returns one order with the id which was passed.
	 * If `status` is passed as well, the order will be returned only if the status matches.
	 *
	 * The status can be any one of the defined statuses or one of their negation, for example:
	 * get open order with id "id1": getOne("id1", "opened")
	 * get NOT open order: getOne("id1", "!opened")
	 */
	public static getOne(orderId: string, status?: OrderStatusAndNegation) {
		const query = Order.createQueryBuilder()
			.where("id = :orderId", { orderId });

		updateQueryWithStatus(query, status);

		return query.getOne();
	}

	public static getAll(userId: string): Promise<Order[]>;
	public static getAll(userId: string, limit: number): Promise<Order[]>;
	public static getAll(userId: string, status: OrderStatusAndNegation): Promise<Order[]>;
	public static getAll(userId: string, status: OrderStatusAndNegation, limit: number): Promise<Order[]>;
	public static getAll(userId: string, second?: number | OrderStatusAndNegation, third?: number): Promise<Order[]> {
		const status: OrderStatusAndNegation | null = typeof second === "string" ? second : null;
		const limit: number | null = typeof second === "number" ? second : (typeof third === "number" ? third : null);
		const query = Order.createQueryBuilder()
			.where("user_id = :userId", { userId })
			.orderBy("completion_date", "DESC")
			.addOrderBy("id", "DESC");

		updateQueryWithStatus(query, status);

		if (limit) {
			query.limit(limit);
		}

		return query.getMany();
	}

	@Column()
	public type!: OfferType;

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
