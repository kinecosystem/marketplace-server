import * as moment from "moment";
import { Column, Entity } from "typeorm";

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
export type OrderError = {
	code: number;
	error: string;
	message?: string;
};

@Entity({ name: "orders" })
@Register
@Initializer("id", () => generateId(IdPrefix.Transaction))
export class Order extends CreationDateModel {
	/**
	 * Returns one order with the id which was passed.
	 * If `status` is passed as well, the order will be returned only if the status matches.
	 *
	 * The status can be any one of the defined statuses or one of their negation, for example:
	 * get open order with id "id1": getOrder("id1", "opened")
	 * get NOT open order: getOrder("id1", "!opened")
	 */
	public static getOrder(orderId: string, status?: OpenOrderStatus | "!opened" | "!completed" | "!failed" | "!pending") {
		const query = Order.createQueryBuilder()
			.where("id = :orderId", { orderId });

		if (status) {
			query.andWhere("status :eq :status", { eq: status.startsWith("!"), status: "opened" });
		}

		return query.getOne();
	}

	public static getAllNonOpen(userId: string, limit: number): Promise<Order[]> {
		return Order.createQueryBuilder()
			.where("user_id = :userId", { userId })
			.andWhere("status != :status", { status: "opened" })
			.orderBy("completion_date", "DESC")
			.addOrderBy("id", "DESC")
			.limit(limit)
			.getMany();
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
				return moment(this.currentStatusDate).add(2, "minutes").toDate();

			default:
				return null;
		}
	}
}
