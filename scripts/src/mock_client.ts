import * as expect from "expect";
import * as jsonwebtoken from "jsonwebtoken";
import axios from "axios";

import { JWTContent } from "./public/jwt";
import { Order } from "./public/services/orders";
import { Offer } from "./public/services/offers";
import { Application } from "./models/applications";
import { generateId, randomInteger, retry } from "./utils";
import { ContentType, JWTValue, OfferType } from "./models/offers";
import { ExternalOfferPayload } from "./public/services/native_offers";
import { Client as MarketplaceClient, ClientError, JWTPayload } from "./client";
import { CompletedPayment, JWTBodyPaymentConfirmation } from "./internal/services";
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

const JWT_SERVICE_BASE = process.env.JWT_SERVICE_BASE;
const API_KEY = process.env.API_KEY || Application.SAMPLE_API_KEY;  // get this from JWT_SERVICE

// TODO: should this be moved to the client?
class SampleAppClient {
	public async getRegisterJWT(userId: string): Promise<string> {
		const res = await axios.get<JWTPayload>(JWT_SERVICE_BASE + `/register/token?user_id=${ userId }`);
		return res.data.jwt;
	}

	public async getSpendJWT(offerId: string): Promise<string> {
		const res = await axios.get<JWTPayload>(JWT_SERVICE_BASE + `/spend/token?offer_id=${ offerId }`);
		return res.data.jwt;
	}

	public async getEarnJWT(userId: string, offerId: string): Promise<string> {
		const res = await axios.get<JWTPayload>(JWT_SERVICE_BASE + `/earn/token?user_id=${ userId }&offer_id=${ offerId }`);
		return res.data.jwt;
	}

	public async getOffers(): Promise<ExternalOfferPayload[]> {
		const res = await axios.get<{ offers: ExternalOfferPayload[] }>(JWT_SERVICE_BASE + "/offers");
		return res.data.offers;
	}

	public async isValidSignature(jwt: string): Promise<boolean> {
		const res = await axios.get<{ is_valid: boolean }>(JWT_SERVICE_BASE + `/validate?jwt=${ jwt }`);
		return res.data.is_valid;
	}
}

/**
 * helper function to get a specific offer
 */
async function getOffer(client: MarketplaceClient, offerType: OfferType, contentType?: ContentType): Promise<Offer> {
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

	const client = await MarketplaceClient.create({
			apiKey: API_KEY,
			userId: "new_user_123" },  "GDZTQSCJQJS4TOWDKMCU5FCDINL2AUIQAKNNLW2H2OCHTC4W2F4YKVLZ");

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

	const client = await MarketplaceClient.create({
			apiKey: API_KEY,
			userId: "rich_user2" }, "SAM7Z6F3SHWWGXDIK77GIXZXPNBI2ABWX5MUITYHAQTOEG64AUSXD6SR");

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

	const client = await MarketplaceClient.create({
			apiKey: API_KEY,
			userId: "earn:" + generateId() }, "GDZTQSCJQJS4TOWDKMCU5FCDINL2AUIQAKNNLW2H2OCHTC4W2F4YKVLZ");

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

	const client = await MarketplaceClient.create({
		apiKey: API_KEY,
		userId: "quiz_user:" + generateId() }, "GDZTQSCJQJS4TOWDKMCU5FCDINL2AUIQAKNNLW2H2OCHTC4W2F4YKVLZ");

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
	const client = await MarketplaceClient.create({
		apiKey: API_KEY,
		userId: "tutorial:" + generateId() }, "GDZTQSCJQJS4TOWDKMCU5FCDINL2AUIQAKNNLW2H2OCHTC4W2F4YKVLZ");

	await client.activate();

	const selectedOffer = await getOffer(client, "earn", "tutorial");

	console.log(`requesting order for offer: ${selectedOffer.id}: ${selectedOffer.content.slice(0, 100)}`);
	const openOrder = await client.createOrder(selectedOffer.id);
	console.log(`got order ${openOrder.id}`);

	const content = JSON.stringify({});

	await client.submitOrder(openOrder.id, content);
	const order = await retry(() => client.getOrder(openOrder.id), order => order.status === "completed", "order did not turn completed");

	console.log(`completion date: ${order.completion_date}`);
	console.log(`got order after submit`, order);
	console.log(`order history`, (await client.getOrders()).orders.slice(0, 2));
}

async function testRegisterNewUser() {
	console.log("===================================== testRegisterNewUser =====================================");
	const client = await MarketplaceClient.create({
		apiKey: API_KEY,
		userId: "new_user:" + generateId() });
}

/*async function justPay() {
	console.log("===================================== justPay =====================================");
	const client = await MarketplaceClient.create({
		apiKey: API_KEY,
		userId: generateId() });

	await client.pay("GCZ72HXIUSDXEEL2RVZR6PXHGYU7S3RMQQ4O6UVIXWOU4OUVNIQKQR2X", 1, "SOME_ORDER");

}*/

async function registerJWT() {
	console.log("===================================== registerJWT =====================================");

	const userId = generateId();
	const appClient = new SampleAppClient();
	const jwt = await appClient.getRegisterJWT(userId);
	const client = await MarketplaceClient.create({ jwt });
}

async function nativeSpendFlow() {
	console.log("===================================== nativeSpendFlow =====================================");

	// this address is prefunded with test kin
	const userId = "test:rich_user:" + generateId();
	const appClient = new SampleAppClient();
	const jwt = await appClient.getRegisterJWT(userId);

	const client = await MarketplaceClient.create({ jwt }, "SAM7Z6F3SHWWGXDIK77GIXZXPNBI2ABWX5MUITYHAQTOEG64AUSXD6SR");
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

	const userId = "rich_user:" + generateId();
	const appClient = new SampleAppClient();
	const jwt = await appClient.getRegisterJWT(userId);

	const client = await MarketplaceClient.create({ jwt }, "SAM7Z6F3SHWWGXDIK77GIXZXPNBI2ABWX5MUITYHAQTOEG64AUSXD6SR");
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

	// this address is prefunded with test kin
	const userId = "test:" + generateId();
	const appClient = new SampleAppClient();
	const jwt = await appClient.getRegisterJWT(userId);

	const client = await MarketplaceClient.create({ jwt }, "GDZTQSCJQJS4TOWDKMCU5FCDINL2AUIQAKNNLW2H2OCHTC4W2F4YKVLZ");
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

async function main() {
	await registerJWT();
	await earnPollFlow();
	await earnTutorial();
	await spendFlow();
	await earnQuizFlow();
	await nativeEarnFlow();
	await nativeSpendFlow();
	await didNotApproveTOS();
	await testRegisterNewUser();
	await tryToNativeSpendTwice();
}

main()
	.then(() => console.log("done"))
	.catch(err => {
		console.log(err.message + "\n" + err.stack);
		process.exitCode = 1;
	});
