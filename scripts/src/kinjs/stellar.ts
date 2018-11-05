import {
	CollectionPage,
	PaymentOperationRecord,
	TransactionRecord,
	Asset,
	Keypair,
	xdr,
	Operation,
	Memo
} from "stellar-sdk";
import * as StellarSdk from "stellar-sdk";

import { retry } from "./utils";

export * from "stellar-sdk";

declare module "stellar-sdk" {
	export namespace Operation {
		interface ChangeTrustOptions {
			limit?: string;
		}
	}
}

export const KIN_ASSET_CODE = "KIN";

export type NativeBalance = {
	balance: string;
	asset_type: "native";
};

export function isNativeBalance(obj: any): obj is NativeBalance {
	return obj &&
		typeof obj.balance === "string" &&
		obj.asset_type === "native";
}

export type KinBalance = {
	limit: string;
	balance: string;
	asset_issuer: string;
	asset_type: "credit_alphanum4";
	asset_code: typeof KIN_ASSET_CODE;
};

export function isKinBalance(obj: any, asset: Asset): obj is KinBalance {
	return obj &&
		typeof obj.balance === "string" &&
		obj.asset_code === asset.code &&
		obj.asset_issuer === asset.issuer &&
		obj.asset_type === "credit_alphanum4";
}

export function isKinAccount(account: StellarSdk.AccountResponse, asset: Asset): boolean {
	return account && account.balances && account.balances.some(balance => isKinBalance(balance, asset));
}

export function getKinBalance(account: StellarSdk.AccountResponse, asset: Asset): KinBalance | undefined {
	// return the balance of the given asset or undefined when asset isn't trusted
	return account && account.balances ?
		account.balances.find(balance => isKinBalance(balance, asset)) as KinBalance
		: undefined;
}

export type TransactionError = {
	data: {
		title: string;
		type: string;
		status: number;
		detail: string;
		extras: {
			envelope_xdr: string;
			result_xdr: string;
			result_codes: {
				transaction: string;
				operations: string[];
			}
		}
	}
};

export function isTransactionError(error: any): error is TransactionError {
	return error.data && error.data.extras &&
		typeof error.data.title === "string" &&
		typeof error.data.type === "string" &&
		typeof error.data.status === "number" &&
		typeof error.data.detail === "string";
}

function isTransactionRecord(obj: TransactionRecord | PaymentOperationRecord): obj is TransactionRecord {
	return (obj as TransactionRecord).hash !== undefined;
}

export class StellarPayment {
	public static from(stellarTransaction: TransactionRecord): Promise<StellarPayment>;
	public static from(stellarPaymentOperation: PaymentOperationRecord): Promise<StellarPayment>;
	public static async from(stellarObj: TransactionRecord | PaymentOperationRecord): Promise<StellarPayment> {
		let transaction: TransactionRecord;
		let operation: PaymentOperationRecord;

		if (isTransactionRecord(stellarObj)) {
			transaction = stellarObj;
			operation = (await stellarObj.operations())._embedded.records[0] as PaymentOperationRecord;
		} else {
			operation = stellarObj;
			transaction = await operation.transaction();
		}

		return new StellarPayment(transaction, operation);
	}

	public static async allFrom(collection: CollectionPage<PaymentOperationRecord>): Promise<StellarPayment[]> {
		return await Promise.all(collection.records.map(async record => await this.from(record)));
	}

	public readonly transaction: TransactionRecord;
	public readonly operation: PaymentOperationRecord;

	private constructor(transaction: TransactionRecord, operation: PaymentOperationRecord) {
		this.operation = operation;
		this.transaction = transaction;
	}

	public get id() {
		return this.transaction.id;
	}

	public get hash() {
		return this.transaction.hash;
	}

	public get amount() {
		return this.operation.amount;
	}

	public get to() {
		return this.operation.to;
	}

	public get from() {
		return this.operation.from;
	}

	public get created_at() {
		return this.transaction.created_at;
	}

	public get memo() {
		return this.transaction.memo;
	}

	public get asset_code() {
		return this.operation.asset_code;
	}

	public get asset_issuer() {
		return this.operation.asset_issuer;
	}

	public is(asset: Asset): boolean {
		return this.asset_code === asset.code && this.asset_issuer === asset.issuer;
	}
}

export class Operations {
	public static for(server: StellarSdk.Server, keys: Keypair, asset: Asset): Operations {
		return new Operations(server, keys, asset);
	}

	private readonly asset: Asset;
	private readonly keys: Keypair;
	private readonly server: StellarSdk.Server;

	private constructor(server: StellarSdk.Server, keys: Keypair, asset: Asset) {
		this.keys = keys;
		this.asset = asset;
		this.server = server;
	}

	public async send(operation: xdr.Operation<Operation.Operation>, memoText?: string): Promise<TransactionRecord> {
		const account = await this.loadAccount(this.keys.publicKey());  // loads the sequence number
		return await this._send(account, operation, memoText);
	}

	public async establishTrustLine(): Promise<KinBalance> {
		const op = StellarSdk.Operation.changeTrust({ asset: this.asset });
		await this.send(op);
		return this.checkKinBalance(this.keys.publicKey());
	}

	@retry({ errorMessagePrefix: "failed to load account" })
	public async loadAccount(address: string): Promise<StellarSdk.AccountResponse> {
		return await this.server.loadAccount(address);
	}

	@retry()
	private async checkKinBalance(address: string) {
		const accountResponse = await this.server.loadAccount(address);
		if (isKinAccount(accountResponse, this.asset)) {
			return getKinBalance(accountResponse, this.asset)!;
		}

		throw new Error("failed to establish trustline");
	}

	@retry({ errorMessagePrefix: "transaction failure" })
	private async _send(account: StellarSdk.AccountResponse, operation: xdr.Operation<Operation.Operation>, memoText?: string) {
		try {
			const transactionBuilder = new StellarSdk.TransactionBuilder(account);
			transactionBuilder.addOperation(operation);

			if (memoText) {
				transactionBuilder.addMemo(Memo.text(memoText));
			}
			const transaction = transactionBuilder.build();

			transaction.sign(this.keys);

			return await this.server.submitTransaction(transaction);
		} catch (e) {
			if (isTransactionError(e)) {
				throw new Error(
					`\nStellar Error:\ntransaction: ${ e.data.extras.result_codes.transaction }` +
					`\n\toperations: ${e.data.extras.result_codes.operations.join(",")}`
				);
			} else {
				throw e;
			}
		}
	}
}
