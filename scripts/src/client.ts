import * as uuid4 from "uuid4";
import axios, { AxiosPromise, AxiosRequestConfig, AxiosResponse } from "axios";
import { KinWallet, createWallet, KinNetwork, Payment, Keypair } from "@kinecosystem/kin.js";

import { ApiError } from "./errors";
import { AuthToken, UserProfile } from "./public/services/users";
import { OfferList } from "./public/services/offers";
import { CompletedPayment } from "./internal/services";
import { ConfigResponse } from "./public/routes/config";
import { BlockchainConfig } from "./public/services/payment";
import { OpenOrder, Order, OrderList } from "./public/services/orders";

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

class ClientRequests {
	public static async create(data: { device_id: string; wallet_address: string; }) {
		const res = await axios.post<AuthToken>(MARKETPLACE_BASE + "/v1/users", data);
		return new ClientRequests(res.data);
	}

	private authToken: AuthToken;

	private constructor(authToken: AuthToken) {
		this.authToken = authToken;
	}

	public get auth() {
		return this.authToken;
	}

	public async activate() {
		const res = await this.request("/v1/users/me/activate").post<AuthToken>();
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
				const error = new ClientError(`server error for "${ url }" ${ e.response!.status }(${ apiError.code }): ${ apiError.error }`);
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
				"x-request-id": uuid4(),
				"Authorization": this.auth ? `Bearer ${ this.auth.token }` : "",
			},
		};
	}
}

export class Client {
	public static async create(signInPayload: SignInPayload, walletAddress?: string): Promise<Client> {
		if (!this.config) {
			const res = await axios.get<ConfigResponse>(MARKETPLACE_BASE + "/v1/config");
			this.config = res.data.blockchain;
		}
		const network = KinNetwork.from(
			this.config.network_passphrase,
			this.config.asset_issuer,
			this.config.horizon_url);

		const keys = !walletAddress ?
			Keypair.random() :
			(walletAddress.startsWith("S") ?
				Keypair.fromSecret(walletAddress) :
				Keypair.fromPublicKey(walletAddress));

		const data = {
			device_id: "my_device",
			wallet_address: keys.publicKey(),
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

		const requests = await ClientRequests.create(data);
		const wallet = await createWallet(network, keys);

		return new Client(wallet, requests);
	}

	private static config: BlockchainConfig;

	public readonly appId: string;

	private readonly wallet: KinWallet;
	private readonly requests: ClientRequests;

	private constructor(wallet: KinWallet, requests: ClientRequests) {
		this.wallet = wallet;
		this.requests = requests;
		this.appId = requests.auth.app_id;
	}

	public get active(): boolean {
		return this.requests.auth.activated;
	}

	public async activate() {
		await this.requests.activate();
	}

	public async pay(recipient: string, amount: number, orderId: string) {
		const memo = createMemo(this.appId, orderId);
		return await this.wallet.pay(recipient, amount, memo);
	}

	public async getOffers(): Promise<OfferList> {
		const res = await this.requests.request("/v1/offers").get<OfferList>();
		return res.data;
	}

	public async getOrder(orderId: string): Promise<Order> {
		const res = await this.requests.request(`/v1/orders/${orderId}`).get<Order>();
		return res.data;
	}

	public async createOrder(offerId: string): Promise<OpenOrder> {
		const res = await this.requests.request(`/v1/offers/${offerId}/orders`).post<OpenOrder>();
		return res.data;
	}

	public async cancelOrder(orderId: string): Promise<void> {
		const res = await this.requests.request(`/v1/orders/${orderId}`).delete();
	}

	public async changeOrder(orderId: string, data: Partial<Order>): Promise<Order> {
		const res = await this.requests.request(`/v1/orders/${orderId}`, data).patch<Order>();
		return res.data;
	}

	public async changeOrderToFailed(orderId: string, error: string, code: number, message: string): Promise<Order> {
		return await this.changeOrder(orderId, { error: { error, code, message } });
	}

	public async getOrders(): Promise<OrderList> {
		const res = await this.requests.request("/v1/orders").get<OrderList>();
		return res.data;
	}

	public async submitOrder(orderId: string, content?: string): Promise<Order> {
		const res = await this.requests.request(`/v1/orders/${orderId}`, { content }).post<Order>();
		return res.data;
	}

	public async createExternalOrder(jwt: string): Promise<OpenOrder> {
		const res = await this.requests.request(`/v1/offers/external/orders`, { jwt }).post<OpenOrder>();
		return res.data;
	}

	public async getUserProfile(userId: string = "me"): Promise<UserProfile> {
		const res = await this.requests.request(`/v1/users/${userId}`).get<UserProfile>();
		return res.data;
	}

	public async findKinPayment(orderId: string): Promise<CompletedPayment | undefined> {
		return (await this.wallet.getPayments())
			.map(paymentFromTransaction)
			.find(payment => payment !== undefined && payment.id === orderId);
	}
}
