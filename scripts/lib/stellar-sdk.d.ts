export * from "stellar-sdk";

declare module "stellar-sdk" {
	export namespace Operation {
		interface ChangeTrustOptions {
			limit?: string;
		}
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
}
