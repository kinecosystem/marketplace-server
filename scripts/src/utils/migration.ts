import { getAxiosClient } from "./axios_client";
import { BlockchainConfig, getBlockchainConfig } from "../public/services/payment";
import { getDefaultLogger as logger } from "../logging";
import { getConfig } from "../public/config";
import { verify as verifyJwt } from "../public/jwt";
import { InvalidExternalOrderJwt, MissingFieldJWT } from "../errors";
import { assertRateLimitMigration } from "./rate_limit";

const httpClient = getAxiosClient();
let BLOCKCHAIN: BlockchainConfig;
let BLOCKCHAIN3: BlockchainConfig;
const ALREADY_MIGRATED_ERROR = 4002;

type WalletResponse = {
	balances: Array<{
		balance: string,
		asset_type: "credit_alphanum4" | "native",
		asset_code?: string,
		asset_issuer?: string
	}>
};

export async function init() {
	BLOCKCHAIN = await getBlockchainConfig("2");
	BLOCKCHAIN3 = await getBlockchainConfig("3");
}

// return True if wallet has zero balance on kin2
export async function hasKin2ZeroBalance(walletAddress: string): Promise<boolean> {
	try {
		const res = await httpClient.get<WalletResponse>(`${ BLOCKCHAIN.horizon_url }/accounts/${ walletAddress }`);
		for (const balance of res.data.balances) {
			if (balance.asset_issuer === BLOCKCHAIN.asset_issuer &&
				balance.asset_code === BLOCKCHAIN.asset_code) {
				return parseFloat(balance.balance) === 0;
			}
		}
		return true; // no balance is zero balance
	} catch (e) {
		logger().warn("couldn't reach horizon to check user balance - assuming non-zero");
		return false; // assume user has non zero balance if can't reach horizon
	}
}

export async function hasKin3Account(walletAddress: string) {
	try {
		await httpClient.get<WalletResponse>(`${ BLOCKCHAIN3.horizon_url }/accounts/${ walletAddress }`);
		return true;
	} catch (e) {
		return false;
	}
}

export class MigrationError extends Error {
}

// returns true if migration call succeeded
export async function migrateZeroBalance(walletAddress: string): Promise<void> {
	const res = await httpClient.post(`${ getConfig().migration_service }/migrate?address=${ walletAddress }`,
		null,
		{ validateStatus: status => status < 500 }); // allow 4xx errors
	if (res.status < 300 ||
		res.status === 400 && res.data.code === ALREADY_MIGRATED_ERROR) {
		return;
	}

	throw new MigrationError(`migration failed with status: ${ res.status }`);
}

type MigrationListPayload = {
	user_ids: string[];
};

// return a list of user_ids from jwt if valid
export async function validateMigrationListJWT(jwt: string, appId: string): Promise<string[]> {
	const decoded = await verifyJwt<Partial<MigrationListPayload>, "migration_list">(jwt);

	if (!decoded.payload.user_ids) {
		throw MissingFieldJWT("user_ids");
	}

	if (decoded.payload.iss !== appId) {
		throw InvalidExternalOrderJwt("issuer must match appId");
	}

	if (decoded.payload.user_ids.length > 10000) {
		throw Error("number of users should be less than 10000"); // TODO create error code
	}

	return decoded.payload.user_ids;
}

// return true if a user migration is within rate limits
export async function withinMigrationRateLimit(appId: string) {
	try {
		await assertRateLimitMigration(appId);
		return true;
	} catch (e) {
		return false;
	}
}
