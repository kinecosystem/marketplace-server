import * as axios from "axios";
import * as uuid4 from "uuid4";
import { Offer, OfferList } from "./public/services/offers";
import { OpenOrder, Order, OrderList } from "./public/services/orders";
import { Poll, Tutorial, TUTORIAL_DESCRIPTION } from "./public/services/offer_contents";
import { delay, generateId } from "./utils";
import { Application } from "./models/applications";
import { ApiError } from "./public/middleware";
import * as StellarSdk from "stellar-sdk";
import { AuthToken } from "./public/services/users";
import { Operation, xdr, Memo } from "stellar-sdk";
import { TransactionRecord } from "stellar-sdk";

const BASE = "http://localhost:3000";
// const BASE = "https://api.kinmarketplace.com"; // production - XXX get this from env var?

class Stellar {
	public static MEMO_VERSION = 1;
	public server!: StellarSdk.Server; // StellarSdk.Server
	public kinAsset!: StellarSdk.Asset; // StellarSdk.Asset
	public constructor(network: "production" | "testnet") {
		if (network === "testnet") {
			StellarSdk.Network.useTestNetwork();
			this.server = new StellarSdk.Server("https://horizon-testnet.stellar.org");
			this.kinAsset = new StellarSdk.Asset("KIN", "GCKG5WGBIJP74UDNRIRDFGENNIH5Y3KBI5IHREFAJKV4MQXLELT7EX6V");
		} // else - get production values
	}
}

const STELLAR = new Stellar("testnet");

class Client {
	public authToken!: AuthToken;
	private keyPair!: StellarSdk.Keypair;
	private appId!: string;

	public async register(appId: string, apiKey: string, userId: string, walletAddress?: string) {
		const generatedWallet = !walletAddress;
		if (walletAddress) {
			if (walletAddress.startsWith("S")) {
				this.keyPair = StellarSdk.Keypair.fromSecret(walletAddress);
			} else {
				this.keyPair = StellarSdk.Keypair.fromPublicKey(walletAddress);
			}
		} else { // generate a keypair
			this.createWallet();
		}

		const res = await this._post("/v1/users", {
			sign_in_type: "whitelist",
			user_id: userId,
			device_id: "my_device",
			app_id: appId,
			api_key: Application.KIK_API_KEY,
			public_address: this.keyPair.publicKey(),
		});

		this.appId = appId;
		this.authToken = res.data;

		if (generatedWallet) {
			const res = await this.establishTrustLine();
			console.log("trust tx hash: " + res.hash);
		}
	}

	public get isActive(): boolean {
		return this.authToken.activated;
	}

	public async pay(recipientAddress: string, amount: number, orderId: string): Promise<TransactionRecord> {
		const op = StellarSdk.Operation.payment({
			destination: recipientAddress,
			asset: STELLAR.kinAsset,
			amount: amount.toString()
		});
		const memoText = `${Stellar.MEMO_VERSION}-${this.appId}-${orderId}`;
		return await this.stellarOperation(op, memoText);
	}

	public streamPayments() {
		const es = STELLAR.server.payments()
			.cursor("now")
						.stream({
								onmessage: () => { // XXX BUG should receive message
									console.log();
								}
						});
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
		const apiError: ApiError = ex.response!.data;
		throw Error(`server error ${ex.response!.status}(${apiError.status}): ${apiError.error}`);
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
				"Authorization": this.authToken ? `Bearer ${this.authToken.token}` : "",
			},
		};
	}

	private createWallet(): void {
		this.keyPair = StellarSdk.Keypair.random();
	}

	private async stellarOperation(operation: xdr.Operation<Operation.Operation>, memoText?: string): Promise<TransactionRecord> {
		const accountResponse = await STELLAR.server.loadAccount(this.keyPair.publicKey());
		const transactionBuilder = new StellarSdk.TransactionBuilder(accountResponse);
		transactionBuilder.addOperation(operation);
		if (memoText) {
			transactionBuilder.addMemo(Memo.text(memoText));
		}
		const transaction = transactionBuilder.build();

		transaction.sign(this.keyPair);
		return await STELLAR.server.submitTransaction(transaction);
	}

	private async establishTrustLine(): Promise<TransactionRecord> {
		const op = StellarSdk.Operation.changeTrust({
			asset: STELLAR.kinAsset,
			limit: "" // XXX BUG this should be optional
		});

		let result: TransactionRecord;
		for (let i = 0; i < 3; i++) {
			try {
				result = await this.stellarOperation(op);
			} catch (e) {
				if (i === 2) {
					throw e;
				}

				await delay(3000);
			}
		}

		return result!;
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

async function spendFlow() {
	const client = new Client();
	// this address is prefunded with test kin
	await client.register("kik", Application.KIK_API_KEY, "rich_user1", "SAM7Z6F3SHWWGXDIK77GIXZXPNBI2ABWX5MUITYHAQTOEG64AUSXD6SR");
	await client.activate();
	const offers = await client.getOffers();

	let selectedOffer: Offer;

	for (const offer of offers.offers) {
		if (offer.offer_type === "spend") {
			selectedOffer = offer;
		}
	}

	console.log(`requesting order for offer: ${selectedOffer!.id}: ${selectedOffer.content}`);
	const openOrder = await client.createOrder(selectedOffer.id);
	console.log(`got order ${openOrder.id}`);
	// pay for the offer
	const res = await client.pay(selectedOffer.blockchain_data.recipient_address!, selectedOffer.amount, openOrder.id);
	console.log("pay result hash: " + res.hash);
	await client.submitOrder(openOrder.id);

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
		throw new Error("order still pending :(");
	}

	console.log(`got order after submit ${JSON.stringify(order, null, 2)}`);
	console.log(`order history ${JSON.stringify((await client.getOrders()).orders.slice(0, 2), null, 2)}`);
}

async function earnFlow() {
	const client = new Client();
	await client.register("kik", Application.KIK_API_KEY, "doody98ds",
		"GDNI5XYHLGZMLDNJMX7W67NBD3743AMK7SN5BBNAEYSCBD6WIW763F2H");
	await client.activate();

	const offers = await client.getOffers();

	let selectedOffer: Offer;

	for (const offer of offers.offers) {
		if (offer.offer_type === "earn") {
			selectedOffer = offer;
		}
	}

	console.log(`requesting order for offer: ${selectedOffer!.id}: ${selectedOffer.content}`);
	const openOrder = await client.createOrder(selectedOffer.id);
	console.log(`got order ${openOrder.id}`);

	// fill in the poll
	console.log("poll " + selectedOffer.content);
	const poll: Poll = JSON.parse(selectedOffer.content);

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
		throw new Error("order still pending :(");
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

	let selectedOffer: Offer;

	for (const offer of offers.offers) {
		if (offer.description === TUTORIAL_DESCRIPTION) {
			console.log("offer", offer);
			selectedOffer = offer;
		}
	}

	console.log(`requesting order for offer: ${selectedOffer!.id}: ${selectedOffer.content.slice(0, 100)}`);
	const openOrder = await client.createOrder(selectedOffer.id);
	console.log(`got order ${openOrder.id}`);

	// fill in the poll
	console.log("poll " + selectedOffer.content.slice(0, 100));
	const poll: Tutorial = JSON.parse(selectedOffer.content);

	const content = JSON.stringify({ });
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
		throw new Error("order still pending :(");
	}

	console.log(`got order after submit ${JSON.stringify(order, null, 2)}`);
	console.log(`order history ${JSON.stringify((await client.getOrders()).orders.slice(0, 2), null, 2)}`);
}

async function testRegisterNewUser() {
	const client = new Client();
	await client.register("kik", Application.KIK_API_KEY, generateId());
}

async function main() {
	await earnFlow();
	await didNotApproveTOS();
	await testRegisterNewUser();
	await earnTutorial();
	await spendFlow();
}

main()
	.then(() => console.log("done"))
	.catch(err => console.log(err.message + "\n" + err.stack));
