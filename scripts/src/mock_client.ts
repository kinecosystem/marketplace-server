import * as axios from "axios";
import * as uuid4 from "uuid4";
import { Offer, OfferList } from "./services/offers";
import { OpenOrder, Order, OrderList } from "./services/orders";
import { Poll, Tutorial } from "./services/offer_contents";
import { delay } from "./utils";
import { Application } from "./models/applications";
import { ApiError } from "./middleware";
import { TUTORIAL_DESCRIPTION } from "./create";
import * as StellarSdk from "stellar-sdk";
import { AuthToken } from "./services/users";

const BASE = "http://localhost:3000";

interface Asset {
	issuer: string;
	code: string;
}
interface Operation {
	data: string;
}
interface TransactionResult {
	data: string;
}

interface KeyPair {
	publicKey(): string;
}

interface Transaction {
	sign(k: KeyPair);
}

interface Server {
	submitTransaction(t: Transaction): TransactionResult;
}

class Stellar {
	public server: Server; // StellarSdk.Server
	public kinAsset: Asset; // StellarSdk.Asset

	public constructor(network: "production" | "testnet") {
		if (network === "testnet") {
			this.server = new StellarSdk.Server("https://horizon-testnet.stellar.org");
			this.kinAsset = new StellarSdk.Asset("KIN", "GCKG5WGBIJP74UDNRIRDFGENNIH5Y3KBI5IHREFAJKV4MQXLELT7EX6V");
		} // else - get production values
	}
}

const STELLAR = new Stellar("testnet");

class Client {

	public authToken: AuthToken;
	private keyPair: KeyPair;

	public async register(appId: string, apiKey: string, userId: string, walletAddress?: string) {
		if (walletAddress) {
			this.keyPair = StellarSdk.Keypair.fromPublicKey(walletAddress);
		} else {
			walletAddress = this.createWallet();
		}

		const res = await this._post("/v1/users", {
			sign_in_type: "whitelist",
			user_id: userId,
			device_id: "my_device",
			app_id: appId,
			api_key: Application.KIK_API_KEY,
			public_address: walletAddress,
		});

		this.authToken = res.data;
		this.establishTrustLine();
	}

	public get isActive(): boolean {
		return this.authToken.activated;
	}

	public async pay(recipientAddress: string, amount: number): Promise<TransactionResult> {
		return await this.stellarOperation(StellarSdk.Operation.payment({
			destination: recipientAddress,
			asset: STELLAR.kinAsset,
			amount
		}));
	}

	public async activate() {
		const res = await this._post("/v1/users/me/activate");
		this.authToken = res.data;
	}

	public async getOffers(): Promise<OfferList> {
		const res = await this._get("/v1/offers");
		return res.data as OfferList;
	}

	public async createOrder(offerId: string): Promise<OpenOrder> {
		const res = await this._post(`/v1/offers/${offerId}/orders`);
		return res.data as OpenOrder;
	}

	public async submitOrder(orderId: string, content?: string): Promise<Order> {
		const res = await this._post(`/v1/orders/${orderId}`, { content });
		return res.data as Order;
	}

	public async getOrder(orderId: string): Promise<Order> {
		const res = await this._get(`/v1/orders/${orderId}`);
		return res.data as Order;
	}

	public async cancelOrder(orderId: string): Promise<void> {
		const res = await this._delete(`/v1/orders/${orderId}`);
	}

	public async changeOrder(orderId: string, data: any): Promise<Order> {
		const res = await this._patch(`/v1/orders/${orderId}`, data);
		return res.data as Order;
	}

	public async changeOrderToFailed(orderId: string, error: string, code: number, message: string): Promise<Order> {
		const res = await this._patch(`/v1/orders/${orderId}`, { error: { error, code, message } });
		return res.data as Order;
	}

	public async getOrders(): Promise<OrderList> {
		const res = await this._get("/v1/orders");
		return res.data as OrderList;
	}

	private handleAxiosError(ex: axios.AxiosError): never {
		const apiError: ApiError = ex.response.data;
		throw Error(`server error ${ex.response.status}(${apiError.status}): ${apiError.error}`);
	}

	private async _delete(url: string): Promise<any> {
		try {
			return await axios.default.delete(BASE + url, this.getConfig());
		} catch (error) {
			this.handleAxiosError(error);
		}
	}

	private async _patch(url: string, data: any): Promise<any> {
		try {
			return await axios.default.patch(BASE + url, data, this.getConfig());
		} catch (error) {
			this.handleAxiosError(error);
		}
	}

	private async _get(url: string): Promise<any> {
		try {
			return await axios.default.get(BASE + url, this.getConfig());
		} catch (error) {
			this.handleAxiosError(error);
		}
	}

	private async _post(url: string, data: any = {}): Promise<any> {
		try {
			return await axios.default.post(BASE + url, data, this.getConfig());
		} catch (error) {
			this.handleAxiosError(error);
		}
	}

	private getConfig() {
		return {
			headers: {
				"x-request-id": uuid4(),
				"Authorization": `Bearer ${this.authToken.token}`,
			},
		};
	}

	private createWallet(): string {
		this.keyPair = StellarSdk.Keypair.random();
		return this.keyPair.publicKey();
	}

	private async stellarOperation(operation: Operation): Promise<TransactionResult> {
		const accountResponse = StellarSdk.Server.loadAccount(this.keyPair.publicKey());
		accountResponse.incrementSequenceNumber();

		const transaction = new StellarSdk.TransactionBuilder(accountResponse).addOperation(operation).build();

		transaction.sign(this.keyPair); // sign the transaction
		return await STELLAR.server.submitTransaction(transaction);
	}

	private async establishTrustLine(): Promise<TransactionResult> {
		return await this.stellarOperation(StellarSdk.Operation.allowTrust({
			trustor: STELLAR.kinAsset.issuer,
			assetCode: STELLAR.kinAsset.code,
			authorize: true,
		}));
	}
}

async function didNotApproveTOS() {
	const client = new Client();
	await client.register("kik", Application.KIK_API_KEY, "new_user_123",
		"GDNI5XYHLGZMLDNJMX7W67NBD3743AMK7SN5BBNAEYSCBD6WIW763F2H");
	const offers = await client.getOffers();
	try {
		await client.createOrder(offers.offers[0].id);
	} catch (error) {
		return; // ok!
	}
	throw Error("expected to throw have to complete TOS");
}

async function spend() {
	const client = new Client();
	await client.register("kik", Application.KIK_API_KEY, "doody",
		"GDNI5XYHLGZMLDNJMX7W67NBD3743AMK7SN5BBNAEYSCBD6WIW763F2H");
	await client.activate();

	console.log(`order history ${JSON.stringify((await client.getOrders()).orders, null, 2)}`);
}

async function earnFlow() {
	const client = new Client();
	await client.register("kik", Application.KIK_API_KEY, "doody98ds",
		"GDNI5XYHLGZMLDNJMX7W67NBD3743AMK7SN5BBNAEYSCBD6WIW763F2H");

	await client.activate();

	const offers = await client.getOffers();

	let earn: Offer;

	for (const offer of offers.offers) {
		if (offer.offer_type === "earn") {
			earn = offer;
		}
	}

	console.log(`requesting order for offer: ${earn.id}: ${earn.content}`);
	const openOrder = await client.createOrder(earn.id);
	console.log(`got order ${openOrder.id}`);

	// fill in the poll
	console.log("poll " + earn.content);
	const poll: Poll = JSON.parse(earn.content);

	const content = JSON.stringify({ [poll.pages[0].question.id]: poll.pages[0].question.answers[0] });
	console.log("answers " + content);

	await client.submitOrder(openOrder.id, content);

	// poll on order payment
	let order = await client.getOrder(openOrder.id);
	console.log(`completion date: ${order.completion_date}`);
	for (let i = 0; i < 30 && order.status === "pending"; i++) {
		order = await client.getOrder(openOrder.id);
		await delay(1000);
	}
	console.log(`completion date: ${order.completion_date}`);

	if (order.status === "completed") {
		console.log("order completed!");
	} else {
		console.log("order still pending :(");
	}

	console.log(`got order after submit ${JSON.stringify(order, null, 2)}`);
	console.log(`order history ${JSON.stringify((await client.getOrders()).orders.slice(0, 2), null, 2)}`);
}

async function earnTutorial() {
	const client = new Client();
	await client.register("kik", Application.KIK_API_KEY, "doody98ds",
		"GDNI5XYHLGZMLDNJMX7W67NBD3743AMK7SN5BBNAEYSCBD6WIW763F2H");

	await client.activate();

	const offers = await client.getOffers();

	let earn: Offer;

	for (const offer of offers.offers) {
		if (offer.description === TUTORIAL_DESCRIPTION) {
			console.log("offer", offer);
			earn = offer;
		}
	}

	console.log(`requesting order for offer: ${earn.id}: ${earn.content}`);
	const openOrder = await client.createOrder(earn.id);
	console.log(`got order ${openOrder.id}`);

	// fill in the poll
	console.log("poll " + earn.content);
	const poll: Tutorial = JSON.parse(earn.content);

	const content = JSON.stringify({});
	console.log("answers " + content);

	await client.submitOrder(openOrder.id, content);

	// poll on order payment
	let order = await client.getOrder(openOrder.id);
	console.log(`completion date: ${order.completion_date}`);
	for (let i = 0; i < 30 && order.status === "pending"; i++) {
		order = await client.getOrder(openOrder.id);
		await delay(1000);
	}
	console.log(`completion date: ${order.completion_date}`);

	if (order.status === "completed") {
		console.log("order completed!");
	} else {
		console.log("order still pending :(");
	}

	console.log(`got order after submit ${JSON.stringify(order, null, 2)}`);
	console.log(`order history ${JSON.stringify((await client.getOrders()).orders.slice(0, 2), null, 2)}`);
}

async function main() {
	await spend();
	await earnFlow();
	await didNotApproveTOS();
	await earnTutorial();
}

main().then(() => console.log("done")).catch(err => console.log(`got error ${err.message}:\n${err.stack}`));
