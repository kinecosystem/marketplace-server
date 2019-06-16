// for admin use only
import { getAxiosClient } from "../utils/axios_client";
import { WalletResponse } from "../utils/migration";
import { BlockchainConfig, getBlockchainConfig } from "../public/services/payment";

const httpClient = getAxiosClient({ timeout: 3000 });
let BLOCKCHAIN: BlockchainConfig;
let BLOCKCHAIN3: BlockchainConfig;

export async function init() {
	BLOCKCHAIN = await getBlockchainConfig("2");
	BLOCKCHAIN3 = await getBlockchainConfig("3");
}

export async function getKin2Balance(walletAddress: string): Promise<number | null> {
	try {
		const res = await httpClient.get<WalletResponse>(`${ BLOCKCHAIN.horizon_url }/accounts/${ walletAddress }`);
		for (const balance of res.data.balances) {
			if (balance.asset_issuer === BLOCKCHAIN.asset_issuer &&
				balance.asset_code === BLOCKCHAIN.asset_code) {
				return parseFloat(balance.balance);
			}
		}
		return 0; // no balance is zero balance
	} catch (e) {
		return null;
	}
}

export async function getKin3Balance(walletAddress: string): Promise<number | null> {
	try {

		const res = await httpClient.get<WalletResponse>(`${ BLOCKCHAIN3.horizon_url }/accounts/${ walletAddress }`);
		for (const balance of res.data.balances) {
			if (balance.asset_type === "native") {
				return parseFloat(balance.balance);
			}
		}
		return 0; // no balance is zero balance
	} catch (e) {
		return null;
	}
}

// returns true if migration service says this address is burned
export async function isBurned(walletAddress: string): Promise<boolean> {
	try {
		const res = await httpClient.get<WalletResponse>(`${ BLOCKCHAIN.horizon_url }/accounts/${ walletAddress }`);
		for (const signer of res.data.signers) {
			if (signer.weight > 0) {
				return false;
			}
		}
		return true;
	} catch (e) {
		return true;
	}
}
