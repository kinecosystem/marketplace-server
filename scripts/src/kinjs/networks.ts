import * as StellarSdk from "stellar-sdk";

import { KIN_ASSET_CODE } from "./stellar";

export class KinNetwork {
	public static readonly Production = new KinNetwork(
		StellarSdk.Networks.PUBLIC,
		"GDF42M3IPERQCBLWFEZKQRK77JQ65SCKTU3CW36HZVCX7XX5A5QXZIVK",
		"https://horizon-kin-ecosystem.kininfrastructure.com"
	);

	public static readonly Testnet = new KinNetwork(
		StellarSdk.Networks.TESTNET,
		"GCKG5WGBIJP74UDNRIRDFGENNIH5Y3KBI5IHREFAJKV4MQXLELT7EX6V",
		"https://horizon-testnet.stellar.org"
	);

	public static from(passphrase: string, issuer: string, horizon: string) {
		return new KinNetwork(passphrase, issuer, horizon);
	}

	public readonly server!: StellarSdk.Server;
	public readonly asset!: StellarSdk.Asset;

	private constructor(passphrase: string, kinAssetIssuer: string, horizonUrl: string) {
		StellarSdk.Network.use(new StellarSdk.Network(passphrase));
		this.server = new StellarSdk.Server(horizonUrl);
		this.asset = new StellarSdk.Asset(KIN_ASSET_CODE, kinAssetIssuer);
	}
}
