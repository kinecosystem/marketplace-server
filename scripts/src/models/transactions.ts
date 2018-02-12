import { Column, Entity, PrimaryColumn } from "typeorm";

import { Model, Register } from "./index";

@Entity()
@Register
export class Transaction extends Model {
	@PrimaryColumn({ name: "id" })
	private _id: string;

	@Column({ name: "created_date" })
	private _createdDate: Date;

	@Column({ name: "type" })
	private _type: string;

	@Column({ name: "blockchain_txid" })
	private _blockchainTxId: string;

	@Column({ name: "user_id" })
	private _userId: string;

	@Column({ name: "meta" })
	private _meta: string;

	@Column({ name: "value" })
	private _value: string;

	public get id(): string {
		return this._id;
	}

	public get createdDate(): Date {
		return this._createdDate;
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
		return JSON.parse(this._meta);
	}

	public get value(): any {
		return JSON.parse(this._value);
	}
}
