import { Column, Entity } from "typeorm";

import { CreationDateModel, register as Register } from "./index";
import { IdPrefix } from "../utils";

export type TransactionMeta = {
	title: string;
	image: string;
	description: string;
	call_to_action: string;
};

export type BlockchainData = {
	transaction_id?: string;
	sender_address?: string;
	recipient_address?: string;
};

@Entity({ name: "orders" })
@Register
export class Order extends CreationDateModel {
	@Column()
	public type: "earn" | "spend";

	@Column("simple-json", { name: "blockchain_data", nullable: true })
	public blockchainData: BlockchainData;

	@Column({ name: "user_id" })
	public userId: string;

	@Column({ name: "offer_id" })
	public offerId: string;

	@Column("simple-json")
	public meta: TransactionMeta;

	@Column("simple-json", { nullable: true }) // the asset?
	public value: any;

	@Column()
	public amount: number;

	public constructor() {
		super(IdPrefix.Transaction);
	}

	public get status(): "completed" | "failed" | "pending" {
		if (this.blockchainData) {
			return "completed";
		}
		return "pending";
	}
}

export class OpenOrder {
	public userId: string;
	public offerId: string;
	public expiration: Date;
	public id: string;
}
