import { Column, Entity } from "typeorm";

import { CreationDateModel, register as Register } from "./index";
import { IdPrefix } from "../utils";
import { AssetValue, OfferType } from "./offers";

export type OrderMeta = {
	title: string;
	description: string;
	call_to_action?: string;
	content?: string;
};

export type BlockchainData = {
	transaction_id?: string;
	sender_address?: string;
	recipient_address?: string;
};

export type FailureReason = {
	failure_message: string;
};

export type OrderStatus = "completed" | "failed" | "pending";

@Entity({ name: "orders" })
@Register
export class Order extends CreationDateModel {
	@Column()
	public type: OfferType;

	@Column("simple-json", { name: "blockchain_data", nullable: true })
	public blockchainData: BlockchainData;

	@Column({ name: "user_id" })
	public userId: string;

	@Column({ name: "offer_id" })
	public offerId: string;

	@Column("simple-json")
	public meta: OrderMeta;

	@Column("simple-json", { nullable: true }) // the asset or JWT payment confirmation
	public value: AssetValue | FailureReason;

	@Column()
	public amount: number;

	@Column()
	public status: OrderStatus;

	@Column({ name: "completion_date", nullable: true })
	public completionDate: Date;

	public constructor() {
		super(IdPrefix.Transaction);
	}
}

export type OpenOrder = {
	userId: string;
	offerId: string;
	expiration: Date;
	id: string;
};
