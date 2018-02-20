import { Column, Entity, PrimaryColumn } from "typeorm";

import { CreationDateModel, Model, register } from "./index";
import { IdPrefix } from "../utils";

@Entity()
@register
export class Transaction extends CreationDateModel {
	@Column()
	public type: string;

	@Column({ name: "blockchain_txid" })
	public blockchainTxId: string;

	@Column({ name: "user_id" })
	public userId: string;

	@Column("simple-json")
	public meta: any;

	@Column("simple-json")
	public value: any;

	public constructor() {
		super(IdPrefix.Transaction);
	}
}
