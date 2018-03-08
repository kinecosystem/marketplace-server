import {
	AccountResponse, AllowTrustOperation, AllowTrustOptions, ChangeTrustOperation, ChangeTrustOptions, Operation,
	PaymentOperation,
	PaymentOptions
} from "stellar-sdk";

declare module "stellar-sdk" {
	namespace Network {
		function useTestNetwork(): void;
	}

	class Asset {
		public issuer: string;
		public code: string;

		constructor(code: string, issuer: string);
	}

	type PaymentOptions = {
		destination: string;
		asset: Asset;
		amount: string;
		source?: string;
	};

	type ChangeTrustOptions = {
		asset: Asset;
		limit?: string;
		source?: string;
	};

	interface Operation {
		payment(options: PaymentOptions): PaymentOperation;
		changeTrust(options: ChangeTrustOptions): ChangeTrustOperation;
	}

	interface PaymentOperation {}

	interface ChangeTrustOperation {}

	type AbstractOperation = PaymentOperation | ChangeTrustOperation;

	interface TransactionResult {
		data: string;
	}

	interface KeyPair {
		publicKey(): string;
	}

	interface Transaction {
		sign(pair: KeyPair);
	}

	interface AccountResponse {
		incrementSequenceNumber(): void;
	}

	class Server {
		constructor(url: string);

		public loadAccount(key: string): Promise<AccountResponse>;
		public submitTransaction(transaction: Transaction): TransactionResult;
	}
}
