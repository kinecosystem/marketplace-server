import * as uuid from "uuid";
import axios, { AxiosPromise, AxiosRequestConfig, AxiosResponse } from "axios";
import { KinWallet, createWallet, KinNetwork, Payment, Keypair } from "@kinecosystem/kin.js";

import { ApiError } from "./errors";
import { AuthToken, UserProfile } from "./public/services/users";
import { OfferList } from "./public/services/offers";
import { CompletedPayment } from "./internal/services";
import { ConfigResponse } from "./public/routes/config";
import { BlockchainConfig } from "./public/services/payment";
import { OpenOrder, Order, OrderList } from "./public/services/orders";
import { StringMap } from "./models/applications";

const MEMO_VERSION = "1";
const MARKETPLACE_BASE = process.env.MARKETPLACE_BASE;

export type JWTPayload = { jwt: string };
export type WhitelistSignInPayload = { apiKey: string, userId: string };
export type SignInPayload = WhitelistSignInPayload | JWTPayload;

function isJWT(obj: any): obj is { jwt: string } {
	return !!obj.jwt;
}

type AxiosRequestNoDataMethod<T = any> = ((url: string, config?: AxiosRequestConfig) => AxiosPromise<T>);
type AxiosRequestDataMethod<T = any> = ((url: string, data?: any, config?: AxiosRequestConfig) => AxiosPromise<T>);

type AxiosRequestMethod<T = any> = AxiosRequestNoDataMethod<T> | AxiosRequestDataMethod<T>;

function createMemo(...items: string[]): string {
	items.unshift(MEMO_VERSION);
	return items.join("-");
}

function breakMemo(memo: string): string[] {
	const items = memo.split("-");
	items.shift();
	return items;
}

function paymentFromTransaction(payment: Payment): CompletedPayment | undefined {
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
	public static async create(data: { device_id: string; }, headers?: StringMap) {
		const res = await axios.post<{ auth: AuthToken; }>(MARKETPLACE_BASE + "/v2/users", data, { headers });
		return new ClientRequests(res.data.auth);
	}

	public static async getConfig(): Promise<ConfigResponse> {
		const res = await axios.get<ConfigResponse>(MARKETPLACE_BASE + "/v2/config");
		return res.data;
	}

	public authToken: AuthToken;

	private constructor(authToken: AuthToken) {
		this.authToken = authToken;
	}

	public get auth() {
		return this.authToken;
	}

	public async activate() {
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
				const apiError: ApiError = e.response!.data;
				const error = new ClientError(`server error for "${ url }" ${ e.response!.status }(${ apiError.code }): ${ apiError.error }, ${ apiError.message }`);
				error.response = e.response;

				throw error;
			}
		};

		return {
			get<T = any>() {
				return req<T>(axios.get, false);
			},
			post<T = any>() {
				return req<T>(axios.post, true);
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
			headers: {
				"x-request-id": uuid(),
				"Authorization": this.auth ? `Bearer ${ this.auth.token }` : "",
			},
		};
	}
}

export class Client {
	public static async create(signInPayload: SignInPayload, config?: { headers?: StringMap }): Promise<Client> {
		if (!this.blockchainConfig) {
			this.blockchainConfig = (await ClientRequests.getConfig()).blockchain;
		}

		const network = KinNetwork.from(
			this.blockchainConfig.network_passphrase,
			this.blockchainConfig.asset_issuer,
			this.blockchainConfig.horizon_url);

		const data = {
			device_id: "my_device"
		};

		if (isJWT(signInPayload)) {
			Object.assign(data, { sign_in_type: "jwt", jwt: signInPayload.jwt });
		} else {
			Object.assign(data, {
				sign_in_type: "whitelist",
				user_id: signInPayload.userId,
				api_key: signInPayload.apiKey
			});
		}

		const requests = await ClientRequests.create(data, config ? config.headers : {});

		return new Client(network, requests);
	}

	private static blockchainConfig: BlockchainConfig;

	public readonly appId: string;
	public readonly requests: ClientRequests;

	public wallet?: KinWallet;

	private readonly network: KinNetwork;

	private constructor(network: KinNetwork, requests: ClientRequests) {
		this.network = network;
		this.requests = requests;
		this.appId = requests.auth.app_id;
	}

	public get active(): boolean {
		return this.requests.auth.activated;
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
		const keys = !walletAddress ?
			Keypair.random() :
			(walletAddress.startsWith("S") ?
				Keypair.fromSecret(walletAddress) :
				Keypair.fromPublicKey(walletAddress));

		if (keys.canSign()) {
			console.log("updating wallet with keys: ", { public: keys.publicKey(), private: keys.secret() });
		} else {
			console.log("updating wallet with public key only: ", { public: keys.publicKey() });
		}

		await this.requests.request("/v2/users/me", { wallet_address: keys.publicKey() }).patch();
		this.wallet = await createWallet(this.network, keys);
	}

	public async pay(recipient: string, amount: number, orderId: string) {
		if (!this.wallet) {
			throw new Error("first set a wallet");
		}

		try {
			const memo = createMemo(this.appId, orderId);
			return await this.wallet.pay(recipient, amount, memo);
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

	public async submitOrder(orderId: string, content?: string): Promise<Order> {
		try {
			const res = await this.requests
				.request(`/v2/orders/${ orderId }`, { content })
				.post<Order>();
			return res.data;
		} catch (e) {
			console.log(`error while submitting order ${ orderId } with content: "${ content }"`);
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

		await this.wallet.trustKin();
	}
}
