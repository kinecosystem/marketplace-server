import { Column, Entity, PrimaryColumn } from "typeorm";

import { CreationDateModel, Model, Register } from "./index";
import { IdPrefix } from "../utils";

@Entity()
@Register
export class Transaction extends CreationDateModel {
	@Column({ name: "type" })
	private _type: string;

	@Column({ name: "blockchain_txid" })
	private _blockchainTxId: string;

	@Column({ name: "user_id" })
	private _userId: string;

	@Column("simple-json", { name: "meta" })
	private _meta: any;

	@Column("simple-json", { name: "value" })
	private _value: any;

	public constructor() {
		super(IdPrefix.Transaction);
	}

	public get blockchainTxId(): string {
		return this._blockchainTxId;
	}

	public get userId(): string {
		return this._userId;
	}

	public get type(): string {
		return this._type;
	}

	public get meta(): any {
		return this._meta;
	}

	public get value(): any {
		return this._value;
	}
}
