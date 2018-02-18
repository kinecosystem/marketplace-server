import { Column, Entity, PrimaryColumn } from "typeorm";

import { CreationDateModel, Model, Register } from "./index";
import { IdPrefix } from "../utils";

@Entity()
@Register
export class Transaction extends CreationDateModel {
	@Column()
	public type: string;

	@Column({ name: "blockchain_txid" })
	public blockchainTxId: string;

	@Column({ name: "user_id" })
	public userId: string;

	@Column({ name: "offer_id" })
	public offerId: string;

	@Column("simple-json")
	public meta: any;

	@Column("simple-json")
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
