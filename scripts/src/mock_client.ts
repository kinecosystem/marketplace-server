import * as axios from "axios";
import { AxiosResponse } from "axios";
import * as uuid4 from "uuid4";
import * as expect from "expect";
import * as StellarSdk from "stellar-sdk";
import {
	CollectionPage,
	Memo,
	Operation,
	PaymentOperationRecord,
	TransactionError,
	TransactionRecord,
	xdr
} from "stellar-sdk";
import * as jsonwebtoken from "jsonwebtoken";

import { ApiError } from "./errors";
import { JWTContent } from "./public/jwt";
import { ContentType, JWTValue, OfferType } from "./models/offers";
import { generateId, randomInteger, retry } from "./utils";
import { AuthToken } from "./public/services/users";
import { Application } from "./models/applications";
import { Offer, OfferList } from "./public/services/offers";
import {
	Answers,
	CouponInfo,
	CouponOrderContent,
	Poll,
	PollPage,
	Quiz,
	QuizPage,
	Tutorial
} from "./public/services/offer_contents";
import { ExternalOfferPayload } from "./public/services/native_offers";
import { OpenOrder, Order, OrderList } from "./public/services/orders";
import { CompletedPayment, JWTBodyPaymentConfirmation } from "./internal/services";
import { ConfigResponse } from "./public/routes/config";
import { BlockchainConfig } from "./public/services/payment";

const BASE = process.env.MARKETPLACE_BASE;
const JWT_SERVICE_BASE = process.env.JWT_SERVICE_BASE;
const API_KEY = process.env.API_KEY || Application.SAMPLE_API_KEY;  // get this from JWT_SERVICE
class Stellar {
	public static MEMO_VERSION = 1;

	public static async get(networkName: "production" | "testnet" | "auto"): Promise<Stellar> {
		let network: StellarSdk.Network;
		let horizonUrl: string;
		let kinAssetCode: string;
		let kinAssetIssuer: string;

		switch (networkName) {
			case "testnet":
				network = new StellarSdk.Network(StellarSdk.Networks.TESTNET);
				horizonUrl = "https://horizon-testnet.stellar.org";
				kinAssetCode = "KIN";
				kinAssetIssuer = "GCKG5WGBIJP74UDNRIRDFGENNIH5Y3KBI5IHREFAJKV4MQXLELT7EX6V";
				break;
			case "production":
				network = new StellarSdk.Network(StellarSdk.Networks.PUBLIC);
				throw new Error("production not supported");
			case "auto":
				const res = await axios.default.get<ConfigResponse>(BASE + "/v1/config");
				const config: BlockchainConfig = res.data.blockchain;
				network = new StellarSdk.Network(config.network_passphrase);
				horizonUrl = config.horizon_url;
				kinAssetCode = config.asset_code;
				kinAssetIssuer = config.asset_issuer;
				break;
			default:
				throw new Error(`${networkName} not supported`);
		}

		console.log(`network: ${network.networkPassphrase()}. horizon: ${horizonUrl}. assetIssuer: ${kinAssetIssuer}`);
		return new Stellar(network, kinAssetCode, kinAssetIssuer, horizonUrl);
	}

	public server!: StellarSdk.Server; // StellarSdk.Server
	public kinAsset!: StellarSdk.Asset; // StellarSdk.Asset

	private constructor(
		network: StellarSdk.Network,
		kinAssetCode: string,
		kinAssetIssuer: string,
		horizonUrl: string) {

		StellarSdk.Network.use(network);
		this.server = new StellarSdk.Server(horizonUrl);
		this.kinAsset = new StellarSdk.Asset(kinAssetCode, kinAssetIssuer);
	}
}

class ClientError extends Error {
	public response?: AxiosResponse;
}

let STELLAR: Stellar;
type JWTPayload = { jwt: string };
type WhitelistSignInPayload = { apiKey: string, userId: string };
type SignInPayload = WhitelistSignInPayload | JWTPayload;

function isJWT(obj: any): obj is { jwt: string } {
	return !!obj.jwt;
}

class SampleAppClient {
	public async getRegisterJWT(userId: string): Promise<string> {
		const res = await axios.default.get<JWTPayload>(JWT_SERVICE_BASE + `/register/token?user_id=${ userId }`);
		return res.data.jwt;
	}

	public async getSpendJWT(offerId: string): Promise<string> {
		const res = await axios.default.get<JWTPayload>(JWT_SERVICE_BASE + `/spend/token?offer_id=${ offerId }`);
		return res.data.jwt;
	}

	public async getEarnJWT(userId: string, offerId: string): Promise<string> {
		const res = await axios.default.get<JWTPayload>(JWT_SERVICE_BASE + `/earn/token?user_id=${ userId }&offer_id=${ offerId }`);
		return res.data.jwt;
	}

	public async getOffers(): Promise<ExternalOfferPayload[]> {
		const res = await axios.default.get<{ offers: ExternalOfferPayload[] }>(JWT_SERVICE_BASE + "/offers");
		return res.data.offers;
	}

	public async isValidSignature(jwt: string): Promise<boolean> {
		const res = await axios.default.get<{ is_valid: boolean }>(JWT_SERVICE_BASE + `/validate?jwt=${ jwt }`);
		return res.data.is_valid;
	}
}

class Client {
	private static KinPaymentFromStellar(operation: PaymentOperationRecord, transaction: TransactionRecord): CompletedPayment | undefined {
		try {
			const [, appId, id] = transaction.memo.split("-", 3);
			return {
				id,
				app_id: appId,
				transaction_id: transaction.hash,
				recipient_address: operation.to,
				sender_address: operation.from,
				amount: parseInt(operation.amount, 10),
				timestamp: transaction.created_at,
			};
		} catch (e) {
			return;
		}
	}

	public readonly appId!: string;
	public authToken!: AuthToken;
	private keyPair!: StellarSdk.Keypair;

	public async register(payload: SignInPayload, walletAddress?: string) {
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
		console.log("registering with wallet: " + this.keyPair.publicKey());

		const data = {
			device_id: "my_device",
			wallet_address: this.keyPair.publicKey(),
		};
		if (isJWT(payload)) {
			Object.assign(data, { sign_in_type: "jwt", jwt: payload.jwt });

		} else {
			Object.assign(data, { sign_in_type: "whitelist", user_id: payload.userId, api_key: payload.apiKey });
		}

		const res = await this._post<AuthToken>("/v1/users", data);

		this.authToken = res.data;
		(this.appId as any) = this.authToken.app_id;

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

	public async getPayments(): Promise<CollectionPage<PaymentOperationRecord>> {
		return await STELLAR.server
			.payments()
			.forAccount(this.keyPair.publicKey())
			.order("desc")
			.limit(10)
			.call();
	}

	public async getKinPayments(): Promise<CompletedPayment[]> {

		// .transaction(stellarPayment as any).transaction_hash)
		// 		.call();

		const payments = await this.getPayments();
		return (await Promise.all(
			payments.records
				.map(async stellarPayment => {
					const tx = (stellarPayment as any).transaction_hash;
					const transaction = (await STELLAR.server
						.transactions()
						.transaction(tx)
						.call()) as any as TransactionRecord;

					return Client.KinPaymentFromStellar(stellarPayment, transaction);
				})
		)).filter(kinPayment => !!kinPayment) as CompletedPayment[];
	}

	public async findKinPayment(orderId: string): Promise<CompletedPayment | undefined> {
		const payments = await this.getKinPayments();
		for (const payment of payments) {
			if (payment.id === orderId) {
				return payment;
			}
		}
	}

	public async activate() {
		const res = await this._post<AuthToken>("/v1/users/me/activate");
		this.authToken = res.data;
	}

	public async getOffers(): Promise<OfferList> {
		const res = await this._get<OfferList>("/v1/offers");
		return res.data;
	}

	public async createOrder(offerId: string): Promise<OpenOrder> {
		const res = await this._post<OpenOrder>(`/v1/offers/${offerId}/orders`);
		return res.data;
	}

	public async createExternalOrder(jwt: string): Promise<OpenOrder> {
		const res = await this._post<OpenOrder>(`/v1/offers/external/orders`, { jwt });
		return res.data;
	}

	public async submitOrder(orderId: string, content?: string): Promise<Order> {
		const res = await this._post<Order>(`/v1/orders/${orderId}`, { content });
		return res.data;
	}

	public async getOrder(orderId: string): Promise<Order> {
		const res = await this._get<Order>(`/v1/orders/${orderId}`);
		return res.data;
	}

	public async cancelOrder(orderId: string): Promise<void> {
		const res = await this._delete(`/v1/orders/${orderId}`);
	}

	public async changeOrder(orderId: string, data: Partial<Order>): Promise<Order> {
		const res = await this._patch<Order>(`/v1/orders/${orderId}`, data);
		return res.data;
	}

	public async changeOrderToFailed(orderId: string, error: string, code: number, message: string): Promise<Order> {
		return await this.changeOrder(orderId, { error: { error, code, message } });
	}

	public async getOrders(): Promise<OrderList> {
		const res = await this._get<OrderList>("/v1/orders");
		return res.data;
	}

	public async establishTrustLine(): Promise<TransactionRecord> {
		const op = StellarSdk.Operation.changeTrust({
			asset: STELLAR.kinAsset
		});
		const self = this;

		async function safeOperation() {
			try {
				return await self.stellarOperation(op);
			} catch (e) {
				return null;
			}
		}

		const res = await retry(() => safeOperation(), res => res !== null, "failed to establish trustline");
		return res!;
	}

	private handleAxiosError(ex: axios.AxiosError): ClientError {
		const apiError: ApiError = ex.response!.data;
		const error = new ClientError(`server error ${ex.response!.status}(${apiError.code}): ${apiError.error}`);
		error.response = ex.response;
		return error;
	}

	private async _delete(url: string): Promise<AxiosResponse<void>> {
		try {
			return await axios.default.delete(BASE + url, this.getConfig());
		} catch (error) {
			throw this.handleAxiosError(error);
		}
	}

	private async _patch<T>(url: string, data: any): Promise<AxiosResponse<T>> {
		try {
			return await axios.default.patch<T>(BASE + url, data, this.getConfig());
		} catch (error) {
			throw this.handleAxiosError(error);
		}
	}

	private async _get<T>(url: string): Promise<AxiosResponse<T>> {
		try {
			return await axios.default.get<T>(BASE + url, this.getConfig());
		} catch (error) {
			throw this.handleAxiosError(error);
		}
	}

	private async _post<T>(url: string, data: any = {}): Promise<AxiosResponse<T>> {
		try {
			return await axios.default.post<T>(BASE + url, data, this.getConfig());
		} catch (error) {
			throw this.handleAxiosError(error);
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
		try {
			const accountResponse = await STELLAR.server.loadAccount(this.keyPair.publicKey());
			const transactionBuilder = new StellarSdk.TransactionBuilder(accountResponse);
			transactionBuilder.addOperation(operation);
			if (memoText) {
				transactionBuilder.addMemo(Memo.text(memoText));
			}
			const transaction = transactionBuilder.build();

			transaction.sign(this.keyPair);
			return await STELLAR.server.submitTransaction(transaction);
		} catch (e) {
			const err: TransactionError = e;
			if (err.data && err.data.extras && err.data.extras.result_codes &&
				err.data.extras.result_codes.transaction &&
				err.data.extras.result_codes.operations) {
				throw new Error(`\nStellar Error:\ntransaction: ${err.data.extras.result_codes.transaction}` +
					`\n\toperations: ${err.data.extras.result_codes.operations.join(",")}`);
			} else {
				throw err;
			}
		}
	}
}

/**
 * helper function to get a specific offer
 */
async function getOffer(client: Client, offerType: OfferType, contentType?: ContentType): Promise<Offer> {
	const offers = await client.getOffers();

	let selectedOffer: Offer | undefined;

	for (const offer of offers.offers.reverse()) {
		if (offer.offer_type === offerType &&
			(!contentType || offer.content_type === contentType)) {
			selectedOffer = offer;
		}
	}
	if (!selectedOffer) {
		throw new Error(`did not find a ${offerType}:${contentType} offer`);
	}
	return selectedOffer;
}

async function didNotApproveTOS() {
	console.log("=====================================didNotApproveTOS=====================================");
	const client = new Client();

	await client.register({ apiKey: API_KEY, userId: "new_user_123" },
		"GDZTQSCJQJS4TOWDKMCU5FCDINL2AUIQAKNNLW2H2OCHTC4W2F4YKVLZ");
	const offers = await client.getOffers();
	try {
		await client.createOrder(offers.offers[0].id);
	} catch (error) {
		return; // ok!
	}
	throw Error("expected to throw have to complete TOS");
}

async function spendFlow() {
	console.log("=====================================spend=====================================");
	const client = new Client();
	// this address is prefunded with test kin

	await client.register({ apiKey: API_KEY, userId: "rich_user2" },
		"SAM7Z6F3SHWWGXDIK77GIXZXPNBI2ABWX5MUITYHAQTOEG64AUSXD6SR");
	await client.activate();
	const selectedOffer = await getOffer(client, "spend");
	const couponInfo: CouponInfo = JSON.parse(selectedOffer.content);

	expect(couponInfo.amount).toEqual(selectedOffer.amount);

	console.log(`requesting order for offer: ${selectedOffer.id}: ${selectedOffer.content}`);
	const openOrder = await client.createOrder(selectedOffer.id);
	console.log(`got open order`, openOrder);

	// pay for the offer
	await client.submitOrder(openOrder.id); // XXX allow the flow where this line is missing
	const res = await client.pay(selectedOffer.blockchain_data.recipient_address!, selectedOffer.amount, openOrder.id);

	console.log("pay result hash: " + res.hash);

	// poll on order payment
	const order = await retry(() => client.getOrder(openOrder.id), order => order.status === "completed", "order did not turn completed");
	console.log(`completion date: ${order.completion_date}`);
	console.log(`got order after submit`, order);
	console.log(`order history`, (await client.getOrders()).orders.slice(0, 2));

	const couponOrderContent: CouponOrderContent = JSON.parse(order.content!);
}

function isValidPayment(order: Order, appId: string, payment: CompletedPayment): boolean {
	return (
		order.amount === payment.amount &&
		order.id === payment.id &&
		order.blockchain_data!.transaction_id === payment.transaction_id &&
		order.blockchain_data!.recipient_address === payment.recipient_address &&
		order.blockchain_data!.sender_address === payment.sender_address &&
		appId === payment.app_id);
}

async function earnPollFlow() {
	function choosePollAnswers(poll: Poll): Answers {
		const answers: Answers = {};
		for (const page of poll.pages.slice(0, poll.pages.length - 1)) {
			const p = (page as PollPage);
			const choice = randomInteger(0, p.question.answers.length);
			answers[p.question.id] = p.question.answers[choice];
		}
		return answers;
	}

	console.log("===================================== earn poll =====================================");
	const client = new Client();
	await client.register({ apiKey: API_KEY, userId: "earn:" + generateId() },
		"GDZTQSCJQJS4TOWDKMCU5FCDINL2AUIQAKNNLW2H2OCHTC4W2F4YKVLZ");
	await client.activate();

	const selectedOffer = await getOffer(client, "earn", "poll");

	console.log(`requesting order for offer: ${selectedOffer.id}: ${selectedOffer.content}`);
	const openOrder = await client.createOrder(selectedOffer.id);
	console.log(`got open order`, openOrder);

	// fill in the poll
	console.log("poll " + selectedOffer.content);
	const poll: Poll = JSON.parse(selectedOffer.content);

	const content = JSON.stringify(choosePollAnswers(poll));
	console.log("answers " + content);

	await client.submitOrder(openOrder.id, content);

	// poll on order payment
	const order = await retry(() => client.getOrder(openOrder.id), order => order.status === "completed", "order did not turn completed");

	console.log(`completion date: ${order.completion_date}`);

	// check order on blockchain
	const payment = (await retry(() => client.findKinPayment(order.id), payment => !!payment, "failed to find payment on blockchain"))!;

	console.log(`got order after submit`, order);
	console.log(`order history`, (await client.getOrders()).orders.slice(0, 2));
	console.log(`payment on blockchain:`, payment);

	if (!isValidPayment(order, client.appId, payment)) {
		throw new Error("payment is not valid - different than order");
	}
}

async function earnQuizFlow() {
	// return answers and expected amount
	function chooseAnswers(quiz: Quiz): [Answers, number] {
		const answers: Answers = {};
		let sum = 0;
		for (const page of quiz.pages.slice(0, quiz.pages.length - 1)) {
			const p = (page as QuizPage);
			const choice = randomInteger(0, p.question.answers.length + 1);  // 0 marks unanswered
			if (choice === p.rightAnswer) {
				sum += p.amount;
			}
			answers[p.question.id] = choice > 0 ? p.question.answers[choice - 1] : "";
		}
		return [answers, sum || 1]; // server will give 1 kin for failed quizes
	}

	console.log("===================================== earn quiz =====================================");
	const client = new Client();
	await client.register({ apiKey: API_KEY, userId: "quiz_user:" + generateId() },
		"GDZTQSCJQJS4TOWDKMCU5FCDINL2AUIQAKNNLW2H2OCHTC4W2F4YKVLZ");
	await client.activate();

	const selectedOffer = await getOffer(client, "earn", "quiz");

	console.log(`requesting order for offer: ${selectedOffer.id}: ${selectedOffer.content}`);
	const openOrder = await client.createOrder(selectedOffer.id);
	console.log(`got open order`, openOrder);

	// answer the quiz
	console.log("quiz " + selectedOffer.content);
	const quiz: Quiz = JSON.parse(selectedOffer.content);

	// TODO write a function to choose the right/ wrong answers
	const [answers, expectedSum] = chooseAnswers(quiz);
	const content = JSON.stringify(answers);
	console.log("answers " + content, " expected sum " + expectedSum);

	await client.submitOrder(openOrder.id, content);

	// poll on order payment
	const order = await retry(() => client.getOrder(openOrder.id), order => order.status === "completed", "order did not turn completed");
	console.log(`completion date: ${order.completion_date}`);
	expect(order.amount).toEqual(expectedSum);

	// check order on blockchain
	const payment = (await retry(() => client.findKinPayment(order.id), payment => !!payment, "failed to find payment on blockchain"))!;

	console.log(`got order after submit`, order);
	console.log(`order history`, (await client.getOrders()).orders.slice(0, 2));
	console.log(`payment on blockchain:`, payment);

	if (!isValidPayment(order, client.appId, payment)) {
		throw new Error("payment is not valid - different than order");
	}
}

async function earnTutorial() {
	console.log("===================================== earnTutorial =====================================");
	const client = new Client();
	await client.register({ apiKey: API_KEY, userId: "tutorial:" + generateId() },
		"GDZTQSCJQJS4TOWDKMCU5FCDINL2AUIQAKNNLW2H2OCHTC4W2F4YKVLZ");
	await client.activate();

	const selectedOffer = await getOffer(client, "earn", "tutorial");

	console.log(`requesting order for offer: ${selectedOffer.id}: ${selectedOffer.content.slice(0, 100)}`);
	const openOrder = await client.createOrder(selectedOffer.id);
	console.log(`got order ${openOrder.id}`);

	const poll: Tutorial = JSON.parse(selectedOffer.content);
	const content = JSON.stringify({});

	await client.submitOrder(openOrder.id, content);
	const order = await retry(() => client.getOrder(openOrder.id), order => order.status === "completed", "order did not turn completed");

	console.log(`completion date: ${order.completion_date}`);
	console.log(`got order after submit`, order);
	console.log(`order history`, (await client.getOrders()).orders.slice(0, 2));
}

async function testRegisterNewUser() {
	console.log("===================================== testRegisterNewUser =====================================");
	const client = new Client();
	await client.register({ apiKey: API_KEY, userId: "new_user:" + generateId() });
}

async function justPay() {
	console.log("===================================== justPay =====================================");
	const client = new Client();
	await client.register({ apiKey: API_KEY, userId: generateId() });
	await client.pay("GCZ72HXIUSDXEEL2RVZR6PXHGYU7S3RMQQ4O6UVIXWOU4OUVNIQKQR2X", 1, "SOME_ORDER");

}

async function registerJWT() {
	console.log("===================================== registerJWT =====================================");

	const client = new Client();
	const userId = generateId();
	const appClient = new SampleAppClient();
	const jwt = await appClient.getRegisterJWT(userId);
	await client.register({ jwt });
}

async function nativeSpendFlow() {
	console.log("===================================== nativeSpendFlow =====================================");

	const client = new Client();
	// this address is prefunded with test kin
	const userId = "rich_user:" + generateId();
	const appClient = new SampleAppClient();
	const jwt = await appClient.getRegisterJWT(userId);

	await client.register({ jwt },
		"SAM7Z6F3SHWWGXDIK77GIXZXPNBI2ABWX5MUITYHAQTOEG64AUSXD6SR");
	await client.activate();

	const selectedOffer = (await appClient.getOffers())[0] as ExternalOfferPayload;
	const offerJwt = await appClient.getSpendJWT(selectedOffer.id);
	console.log(`requesting order for offer: ${ selectedOffer.id }: ${ offerJwt }`);

	const openOrder = await client.createExternalOrder(offerJwt);
	console.log(`got open order`, openOrder);

	expect(openOrder.offer_type).toBe("spend");
	expect(openOrder.amount).toBe(selectedOffer.amount);
	expect(openOrder.offer_id).toBe(selectedOffer.id);

	// pay for the offer
	const res = await client.pay(openOrder.blockchain_data.recipient_address!, selectedOffer.amount, openOrder.id);
	console.log("pay result hash: " + res.hash);
	await client.submitOrder(openOrder.id);

	// poll on order payment
	const order = await retry(() => client.getOrder(openOrder.id), order => order.status === "completed", "order did not turn completed");

	console.log(`completion date: ${order.completion_date}`);

	// find payment on blockchain
	const payment = (await retry(() => client.findKinPayment(order.id), payment => !!payment, "failed to find payment on blockchain"))!;

	expect(payment).toBeDefined();

	console.log(`payment on blockchain:`, payment);
	expect(isValidPayment(order, client.appId, payment)).toBeTruthy();
	console.log(`got order after submit`, order);
	console.log(`order history`, (await client.getOrders()).orders.slice(0, 2));

	expect(order.result!.type).toBe("payment_confirmation");
	const paymentJwt = (order.result! as JWTValue).jwt;
	const jwtPayload = jsonwebtoken.decode(paymentJwt, { complete: true }) as JWTContent<JWTBodyPaymentConfirmation, "payment_confirmation">;
	expect(jwtPayload.payload.offer_id).toBe(order.offer_id);
	expect(jwtPayload.payload.sender_user_id).toBe(userId);
	expect(jwtPayload.header.kid).toBeDefined();
	expect(jwtPayload.payload.iss).toEqual("kin");
	// verify using kin public key
	expect(await appClient.isValidSignature(paymentJwt)).toBeTruthy();
}

async function tryToNativeSpendTwice() {
	console.log("===================================== tryToNativeSpendTwice =====================================");
	const client = new Client();
	const userId = "rich_user:" + generateId();
	const appClient = new SampleAppClient();
	const jwt = await appClient.getRegisterJWT(userId);

	await client.register({ jwt },
		"SAM7Z6F3SHWWGXDIK77GIXZXPNBI2ABWX5MUITYHAQTOEG64AUSXD6SR");
	await client.activate();

	const selectedOffer = (await appClient.getOffers())[0] as ExternalOfferPayload;
	const offerJwt = await appClient.getSpendJWT(selectedOffer.id);
	const openOrder = await client.createExternalOrder(offerJwt);
	console.log(`created order`, openOrder.id, `for offer`, selectedOffer.id);
	// pay for the offer
	const res = await client.pay(openOrder.blockchain_data.recipient_address!, selectedOffer.amount, openOrder.id);
	console.log("pay result hash: " + res.hash);
	await client.submitOrder(openOrder.id);

	// poll on order payment
	const order = await retry(() => client.getOrder(openOrder.id), order => order.status === "completed", "order did not turn completed");

	console.log(`completed order`, order.id);
	const offerJwt2 = await appClient.getSpendJWT(selectedOffer.id);
	// should not allow to create a new order
	console.log(`expecting error for new order`, selectedOffer.id);
	try {
		await client.createExternalOrder(offerJwt2);
		throw new Error("should not allow to create more than one order");
	} catch (e) {
		const err: ClientError = e;
		expect(err.response!.headers.location).toEqual(`/v1/orders/${order.id}`);
		// ok
	}
}

async function nativeEarnFlow() {
	console.log("===================================== nativeEarnFlow =====================================");

	const client = new Client();
	// this address is prefunded with test kin
	const userId = generateId();
	const appClient = new SampleAppClient();
	const jwt = await appClient.getRegisterJWT(userId);

	await client.register({ jwt }, "GDZTQSCJQJS4TOWDKMCU5FCDINL2AUIQAKNNLW2H2OCHTC4W2F4YKVLZ");
	await client.activate();

	const selectedOffer = (await appClient.getOffers()).filter((item: any) => item.type === "earn")[0] as ExternalOfferPayload;
	const offerJwt = await appClient.getEarnJWT(userId, selectedOffer.id);
	console.log(`requesting order for offer: ${ selectedOffer.id }: ${ offerJwt }`);

	const openOrder = await client.createExternalOrder(offerJwt);
	console.log(`got open order`, openOrder);

	expect(openOrder.amount).toBe(selectedOffer.amount);
	expect(openOrder.offer_id).toBe(selectedOffer.id);
	expect(openOrder.offer_type).toBe("earn");

	// pay for the offer
	await client.submitOrder(openOrder.id);

	// poll on order payment
	const order = await retry(() => client.getOrder(openOrder.id), order => order.status === "completed", "order did not turn completed");

	console.log(`completion date: ${order.completion_date}`);

	// find payment on blockchain
	const payment = (await retry(() => client.findKinPayment(order.id), payment => !!payment, "failed to find payment on blockchain"))!;

	expect(payment).toBeDefined();
	console.log(`payment on blockchain:`, payment);
	expect(isValidPayment(order, client.appId, payment)).toBeTruthy();

	const paymentJwt = (order.result! as JWTValue).jwt;
	const jwtPayload = jsonwebtoken.decode(paymentJwt, { complete: true }) as JWTContent<JWTBodyPaymentConfirmation, "payment_confirmation">;

	expect(jwtPayload.payload.offer_id).toBe(order.offer_id);
	expect(jwtPayload.payload.recipient_user_id).toBe(userId);

	console.log(`got order after submit`, order);
	console.log(`order history`, (await client.getOrders()).orders.slice(0, 2));
}

async function createTrust() {
	console.log("===================================== createTrust =====================================");
	const client = new Client();
	// this address is prefunded with test kin
	await client.register({ apiKey: API_KEY, userId: "rich_user2" },
		"SAM7Z6F3SHWWGXDIK77GIXZXPNBI2ABWX5MUITYHAQTOEG64AUSXD6SR");
	const record = await client.establishTrustLine();
	console.log("established trust", record.hash);
}

async function main() {
	STELLAR = await Stellar.get("auto");
	await createTrust();
	// await earnTutorial();
	// await earnPollFlow();
	// await earnQuizFlow();
	// await didNotApproveTOS();
	// await testRegisterNewUser();
	// await spendFlow();
	// await justPay();
	await registerJWT();
	await nativeEarnFlow();
	await nativeSpendFlow();
	await tryToNativeSpendTwice();
}

main()
	.then(() => console.log("done"))
	.catch(err => {
		console.log(err.message + "\n" + err.stack);
		process.exitCode = 1;
	});
