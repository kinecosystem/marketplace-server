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
