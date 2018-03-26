export * from "stellar-sdk";

declare module "stellar-sdk" {
	export namespace Operation {
		interface ChangeTrustOptions {
			limit?: string;
		}
	}
}
