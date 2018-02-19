import { Column, Entity, PrimaryColumn } from "typeorm";

import { CreationDateModel, Model, Register } from "./index";
import { IdPrefix } from "../utils";

export type TransactionMeta = {
	title: string;
	image: string;
	description: string;
	call_to_action: string;
};

@Entity({ name: "orders" })
@Register
export class Order extends CreationDateModel {
	@Column()
	public type: string;

	@Column({ name: "blockchain_txid", nullable: true })
	public blockchainTxId: string;

	@Column({ name: "user_id" })
	public userId: string;

	@Column({ name: "offer_id" })
	public offerId: string;

	@Column("simple-json")
	public meta: TransactionMeta;

	@Column("simple-json") // the asset?
	public value: any;

	public constructor() {
		super(IdPrefix.Transaction);
	}

	public get status(): "open" | "done" | "failed" | "pending" {
		if (this.blockchainTxId) {
			return "done";
		}
		return "open";
	}
}
