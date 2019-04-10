import * as uuid from "uuid";
import axios, { AxiosPromise, AxiosRequestConfig, AxiosResponse } from "axios";
import * as kinjs2 from "@kinecosystem/kin.js";
import * as kinjs1 from "@kinecosystem/kin.js-v1";

import { ApiError } from "./errors";
import { AuthToken, UserProfile } from "./public/services/users";
import { OfferList } from "./public/services/offers";
import { CompletedPayment } from "./internal/services";
import { ConfigResponse } from "./public/routes/config";
import { OpenOrder, Order, OrderList } from "./public/services/orders";
import { StringMap } from "./models/applications";
import { Mutable } from "./utils/utils";
import { CLIENT_SDK_VERSION_HEADER } from "./middleware";
import * as jsonwebtoken from "jsonwebtoken";
import { BlockchainVersion } from "./models/offers";

const MEMO_VERSION = "1";
const MARKETPLACE_BASE = process.env.MARKETPLACE_BASE;

export type JWTPayload = { jwt: string };
export type SignInPayload = JWTPayload;

type AxiosRequestNoDataMethod<T = any> = ((url: string, config?: AxiosRequestConfig) => AxiosPromise<T>);
type AxiosRequestDataMethod<T = any> = ((url: string, data?: any, config?: AxiosRequestConfig) => AxiosPromise<T>);
type AxiosRequestMethod<T = any> = AxiosRequestNoDataMethod<T> | AxiosRequestDataMethod<T>;

export interface AccountMigrationStatus {
	should_migrate: boolean;
	app_blockchain_version: BlockchainVersion;
}

function createMemo(...items: string[]): string {
	items.unshift(MEMO_VERSION);
	return items.join("-");
}

function breakMemo(memo: string): string[] {
	const items = memo.split("-");
	items.shift();
	return items;
}

function paymentFromTransaction(payment: kinjs2.Payment | kinjs1.Payment): CompletedPayment | undefined {
	try {
		const [app_id, id] = breakMemo(payment.memo!);

		return {
			id,
			app_id,
			amount: payment.amount,
			transaction_id: payment.id,
			timestamp: payment.timestamp,
			sender_address: payment.sender,
			recipient_address: payment.recipient
		};
	} catch (e) {
		return;
	}
}

export class ClientError extends Error {
	public response?: AxiosResponse;
}

export class ClientRequests {
	public static async create(data: SignInPayload, headers?: StringMap) {
		// get blockchain version for current app
		const appId = this.extractAppId(data.jwt);
		const blockchainVersion = await this.getBlockchainVersion(appId);
		const token = await this.getToken(data.jwt, headers);

		console.log(`connected to app ${ appId } with version ${ blockchainVersion } as user ${ token.ecosystem_user_id }`);

		return new ClientRequests(token, blockchainVersion, headers);
	}

	public static async getServerConfig(): Promise<ConfigResponse> {
		const res = await axios.get<ConfigResponse>(MARKETPLACE_BASE + "/v2/config");
		return res.data;
	}

	private static async getToken(jwt: string, headers?: StringMap): Promise<AuthToken> {
		const res = await axios.post<{ auth: AuthToken; }>(MARKETPLACE_BASE + "/v2/users", {
			sign_in_type: "jwt",
			jwt
		}, { headers });
		return res.data.auth;
	}

	private static async getBlockchainVersion(appId: string): Promise<BlockchainVersion> {
		const res = await axios.get<number>(
			MARKETPLACE_BASE + `/v2/applications/${ appId }/blockchain_version`);

		return res.data.toString() as BlockchainVersion;
	}

	private static extractAppId(jwt: string) {
		return (jsonwebtoken.decode(jwt) as { iss: string }).iss;

	}

	public authToken: AuthToken;
	public headers: {};
	public blockchainVersion: BlockchainVersion;

	private constructor(authToken: AuthToken, blockchainVersion: BlockchainVersion, headers = {}) {
		this.authToken = authToken;
		this.blockchainVersion = blockchainVersion;
		this.headers = headers;
	}

	public get auth() {
		return this.authToken;
	}

	public async activate() { // TODO Deprecate
		const res = await this.request("/v2/users/me/activate").post<AuthToken>();
		this.authToken = res.data;
	}

	public request(url: string, data?: any) {
		const req = async <T>(fn: AxiosRequestMethod<T>, sendData: boolean) => {
			const config = this.getConfig();
			url = MARKETPLACE_BASE + url;
			try {
				const promise = sendData ?
					(fn as AxiosRequestDataMethod)(url, data, config) :
					(fn as AxiosRequestNoDataMethod)(url, config);

				return await promise;
			} catch (e) {
				if (!e.response) {
					throw e;
				} else {
					const apiError: ApiError = e.response!.data;
					const error = new ClientError(`server error for "${ url }" ${ e.response!.status }(${ apiError.code }): ${ apiError.error }, ${ apiError.message }`);
					error.response = e.response;

					throw error;
				}
			}
		};

		return {
			get<T = any>() {
				return req<T>(axios.get, false);
			},
			post<T = any>() {
				return req<T>(axios.post, true);
			},
			put<T = any>() {
				return req<T>(axios.put, true);
			},
			patch<T = any>() {
				return req<T>(axios.patch, true);
			},
			delete() {
				return req(axios.delete, false);
			}
		};
	}

	private getConfig() {
		return {
			headers: Object.assign({
				"x-kin-blockchain-version": this.blockchainVersion,
				"x-request-id": uuid(),
				"Authorization": this.auth ? `Bearer ${ this.auth.token }` : "",
			}, this.headers),
		};
	}
}

type ClientConfig = { headers?: StringMap, sdkVersion?: string };

export class Client {
	public static async create(signInPayload: SignInPayload, config: ClientConfig = {}): Promise<Client> {
		if (!this.serverConfig) {
			this.serverConfig = await ClientRequests.getServerConfig();
		}
		config.headers = config.headers || {};
		config.headers[CLIENT_SDK_VERSION_HEADER] = config.sdkVersion || "0.9.0";

		const requests = await ClientRequests.create(signInPayload, config.headers);
		return new Client(this.serverConfig, requests, config);
	}

	private static serverConfig: ConfigResponse;

	public readonly appId: string;
	public readonly requests: ClientRequests;
	public wallet?: kinjs1.KinWallet | kinjs2.KinWallet;

	private readonly network2: kinjs1.KinNetwork;
	private readonly network3: kinjs2.KinNetwork;
	private readonly config: { headers?: StringMap } | undefined;

	private constructor(serverConfig: ConfigResponse, requests: ClientRequests, config: { headers?: StringMap } | undefined) {
		this.config = config;

		this.network2 = kinjs1.KinNetwork.from(
			serverConfig.blockchain.network_passphrase,
			serverConfig.blockchain.asset_issuer,
			serverConfig.blockchain.horizon_url);

		this.network3 = kinjs2.KinNetwork.from(
			serverConfig.blockchain3.network_passphrase,
			serverConfig.blockchain3.horizon_url);

		this.requests = requests;
		this.appId = requests.auth.app_id;
	}

	public get active(): boolean {
		return this.requests.auth.activated;
	}

	/**
	 * no need to call this unless you call logout first
	 */
	public async login(signInPayload: SignInPayload) {
		(this as Mutable<Client>).requests = await ClientRequests.create(signInPayload, this.config ? this.config.headers : {});
	}

	public async activate() {
		try {
			await this.requests.activate();
		} catch (e) {
			console.log("error while activating");
			throw e;
		}
	}

	public async updateWallet(walletAddress?: string) {
		const kinjs = this.requests.blockchainVersion === "2" ? kinjs1 : kinjs2;
		const keys = !walletAddress ?
			kinjs.Keypair.random() :
			(walletAddress.startsWith("S") ?
				kinjs.Keypair.fromSecret(walletAddress) :
				kinjs.Keypair.fromPublicKey(walletAddress));

		if (keys.canSign()) {
			console.log("updating wallet with keys: ", { public: keys.publicKey(), private: keys.secret() });
		} else {
			console.log("updating wallet with public key only: ", { public: keys.publicKey() });
		}

		await this.requests.request("/v2/users/me", { wallet_address: keys.publicKey() }).patch();

		if (this.requests.blockchainVersion === "2") {
			this.wallet = await kinjs1.createWallet(this.network2, keys as kinjs1.Keypair);
		} else {
			this.wallet = await kinjs2.createWallet(this.network3, keys as kinjs2.Keypair);
		}

		console.log("wallet with balance", this.wallet.balance.cached);
	}

	public async pay(recipient: string, amount: number, orderId: string): Promise<kinjs1.Payment> {
		if (!this.wallet) {
			throw new Error("first set a wallet");
		}

		if (this.requests.blockchainVersion === "3") {
			throw new Error("on blockchain-v3, payments are sent to server with submitOrder()");
		}

		try {
			// should only work on blockchain v2
			const memo = createMemo(this.appId, orderId);
			return await this.wallet.pay(recipient, amount, memo);
		} catch (e) {
			console.log(`error while paying to ${ recipient }, amount ${ amount } and order ${ orderId }`);
			throw e;
		}
	}

	public async getTransactionXdr(recipient: string, amount: number, orderId: string): Promise<string> {
		if (!this.wallet) {
			throw new Error("first set a wallet");
		}
		if (this.requests.blockchainVersion === "2") {
			throw new Error("on blockchain-v2, payments are sent to blockchain with pay()");
		}

		try {
			// should only work on blockchain v3
			const memo = createMemo(this.appId, orderId);
			return await (this.wallet as kinjs2.KinWallet).getTransactionXdr(recipient, amount, memo);
		} catch (e) {
			console.log(`error while paying to ${ recipient }, amount ${ amount } and order ${ orderId }`);
			throw e;
		}
	}

	public async getOffers(): Promise<OfferList> {
		try {
			const res = await this.requests
				.request("/v2/offers")
				.get<OfferList>();
			return res.data;
		} catch (e) {
			console.log("error while getting offers");
			throw e;
		}
	}

	public async getOrder(orderId: string): Promise<Order> {
		try {
			const res = await this.requests
				.request(`/v2/orders/${ orderId }`)
				.get<Order>();
			return res.data;
		} catch (e) {
			console.log(`error while getting order ${ orderId }`);
			throw e;
		}
	}

	public async createOrder(offerId: string): Promise<OpenOrder> {
		try {
			const res = await this.requests
				.request(`/v2/offers/${ offerId }/orders`)
				.post<OpenOrder>();
			return res.data;
		} catch (e) {
			console.log(`error while creating order for offer ${ offerId }`);
			throw e;
		}
	}

	public async cancelOrder(orderId: string): Promise<void> {
		try {
			await this.requests
				.request(`/v2/orders/${ orderId }`)
				.delete();
		} catch (e) {
			console.log(`error while cancelling order ${ orderId }`);
			throw e;
		}
	}

	public async changeOrder(orderId: string, data: Partial<Order>): Promise<Order> {
		try {
			const res = await this.requests
				.request(`/v2/orders/${ orderId }`, data)
				.patch<Order>();
			return res.data;
		} catch (e) {
			console.log(`error while changing order ${ orderId } and data: ${ JSON.stringify(data) }`);
			throw e;
		}
	}

	public async changeOrderToFailed(orderId: string, error: string, code: number, message: string): Promise<Order> {
		try {
			return await this.changeOrder(orderId, { error: { error, code, message } });
		} catch (e) {
			console.log(`error while changing order ${ orderId } to failed`);
			throw e;
		}
	}

	public async getOrders(): Promise<OrderList> {
		try {
			const res = await this.requests
				.request("/v2/orders")
				.get<OrderList>();
			return res.data;
		} catch (e) {
			console.log(`error while getting orders`);
			throw e;
		}
	}

	public async submitOrder(orderId: string, options: { content?: string, transaction?: string } = {}): Promise<Order> {
		try {
			const res = await this.requests
				.request(`/v2/orders/${ orderId }`, options)
				.post<Order>();
			return res.data;
		} catch (e) {
			console.log(`error while submitting order ${ orderId } with options:`, options);
			throw e;
		}
	}

	public async createExternalOrder(jwt: string): Promise<OpenOrder> {
		try {
			const res = await this.requests
				.request(`/v2/offers/external/orders`, { jwt })
				.post<OpenOrder>();
			return res.data;
		} catch (e) {
			console.log(`error while creating external order with jwt: "${ jwt } "`);
			throw e;
		}
	}

	public async getUserProfile(userId: string = "me"): Promise<UserProfile> {
		try {
			const res = await this.requests
				.request(`/v2/users/${ userId }`)
				.get<UserProfile>();
			return res.data;
		} catch (e) {
			console.log(`error while getting user ${ userId } profile`);
			throw e;
		}
	}

	public async findKinPayment(orderId: string): Promise<CompletedPayment | undefined> {
		if (!this.wallet) {
			throw new Error("first set a wallet");
		}
		return (await this.wallet.getPayments())
			.map(paymentFromTransaction)
			.find(payment => payment !== undefined && payment.id === orderId);

	}

	public async trustKin() {
		if (!this.wallet) {
			throw new Error("first set a wallet");
		}

		if (this.requests.blockchainVersion === "2") {
			await (this.wallet as kinjs1.KinWallet).trustKin();
		}
	}

	public async logout() {
		await this.requests.request("/v2/users/me/session").delete();
	}

	public async shouldMigrate(publicKey: string): Promise<AccountMigrationStatus> {
		return (await this.requests.request(`/v2/migration/info/${ this.appId }/${ publicKey }`).get()).data;
	}

	public async changeAppBlockchainVersion(blockchainVersion: BlockchainVersion) {
		await this.requests.request(`/v2/applications/${ this.appId }/blockchain_version`, {
			blockchain_version: blockchainVersion
		}).put();
		this.requests.blockchainVersion = blockchainVersion;
	}

	public async burnWallet(): Promise<boolean> {
		return await (this.wallet! as kinjs1.KinWallet).burn();
	}
}
