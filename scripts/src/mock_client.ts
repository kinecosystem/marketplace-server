import axios from "axios";
import * as moment from "moment";
import * as expect from "expect";
import * as jsonwebtoken from "jsonwebtoken";

// it's important to have this at the start
import { getConfig } from "./public/config";

getConfig();

import { JWTContent } from "./public/jwt";
import { Order } from "./public/services/orders";
import { Offer } from "./public/services/offers";
import { Order as DbOrder } from "./models/orders";
import { Client as V1MarketplaceClient } from "./client.v1";
import { generateId, randomInteger, retry, delay } from "./utils/utils";
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
} from "./public/services/offer_contents";
import { AnswersBackwardSupport } from "./public/services/offer_contents";
import { Keypair } from "@kinecosystem/kin.js";
import { BlockchainVersion } from "./models/offers";

const SMPL_APP_CONFIG = {
	jwtAddress: process.env.JWT_SERVICE_BASE!,
	keypair: Keypair.fromSecret("SCS2QPEE7TE5OF3UK2LGIRDINZBNGIB35HUL3EOAACMPUQNB3SBYKQQX") // GCRSKU3WTADD4DH3FRHQXIU7T2NO7SFD6DWWPC36BM7GG5TAMLLHZMJY
};
const SMP3_APP_CONFIG = {
	jwtAddress: process.env.JWT_SERVICE_BASE_V3!,
	keypair: Keypair.fromSecret("SBYRN4DBABHCM3CC7W6TR4K42NMHMEHELQNSIZHXTKEFTEADXBFJF2MS") // GDNCL2OGIGSXO5JVXN5D552AVGS3MSG4OOLRS4HEIRXJVDKCQD5N5NLO
};

// TODO: should this be moved to the client?
class SampleAppClient {
	private readonly base: string;

	constructor(base: string) {
		this.base = base;
	}

	public async getV1RegisterJWT(userId: string, iat?: number, exp?: number): Promise<string> {
		const params: any = { user_id: userId };
		if (iat) {
			params.iat = iat;
		}
		if (exp) {
			params.exp = exp;
		}

		const res = await axios.get<JWTPayload>(this.base + "/register/token", { params });
		return res.data.jwt;
	}

	public async getRegisterJWT(userId: string, deviceId: string, iat?: number, exp?: number): Promise<string> {
		const params: any = { user_id: userId, device_id: deviceId };
		if (iat) {
			params.iat = iat;
		}
		if (exp) {
			params.exp = exp;
		}

		const res = await axios.get<JWTPayload>(this.base + "/register/token", { params });
		return res.data.jwt;
	}

	public async getV1SpendJWT(offerId: string, nonce?: string): Promise<string> {
		const res = await axios.get<JWTPayload>(this.base + "/spend/token", {
			params: { offer_id: offerId, nonce }
		});
		return res.data.jwt;
	}

	public async getSpendJWT(userId: string, deviceId: string, offerId: string, nonce?: string): Promise<string> {
		const res = await axios.get<JWTPayload>(this.base + "/spend/token", {
			params: {
				nonce,
				user_id: userId,
				offer_id: offerId,
				device_id: deviceId
			}
		});
		return res.data.jwt;
	}

	public async getV1EarnJWT(userId: string, offerId: string, nonce?: string): Promise<string> {
		const res = await axios.get<JWTPayload>(this.base + "/earn/token", {
			params: { user_id: userId, offer_id: offerId, nonce }
		});
		return res.data.jwt;
	}

	public async getEarnJWT(userId: string, deviceId: string, offerId: string, nonce?: string): Promise<string> {
		const res = await axios.get<JWTPayload>(this.base + "/earn/token", {
			params: {
				nonce,
				user_id: userId,
				offer_id: offerId,
				device_id: deviceId
			}
		});
		return res.data.jwt;
	}

	public async getV1P2PJWT(data: {
		offer_id: string;
		amount: number;
		sender_title: string;
		sender_description: string;
		recipient_id: string;
		recipient_title: string;
		recipient_description: string;
		nonce?: string;
	}) {
		const res = await axios.get<JWTPayload>(this.base + "/p2p/token", {
			params: data
		});
		return res.data.jwt;
	}

	public async getP2PJWT(data: {
		offer_id: string;
		amount: number;
		user_id: string;
		device_id: string;
		sender_title: string;
		sender_description: string;
		recipient_id: string;
		recipient_title: string;
		recipient_description: string;
		nonce?: string;
	}) {
		const res = await axios.get<JWTPayload>(this.base + "/p2p/token", {
			params: data
		});
		return res.data.jwt;
	}

	public async getArbitraryJWT(subject: string, payload: { [key: string]: any }): Promise<string> {
		const res = await axios.get<JWTPayload>(this.base + "/sign", {
			params: { subject, payload }
		});
		return res.data.jwt;
	}

	public async getOffers(): Promise<ExternalOfferPayload[]> {
		const res = await axios.get<{ offers: ExternalOfferPayload[] }>(this.base + "/offers");
		return res.data.offers;
	}

	public async isValidSignature(jwt: string): Promise<boolean> {
		const res = await axios.get<{ is_valid: boolean }>(this.base + `/validate?jwt=${ jwt }`);
		return res.data.is_valid;
	}
}

/**
 * helper function to get a specific offer
 */
async function getOffer(client: MarketplaceClient | V1MarketplaceClient, offerType: OfferType, contentType?: ContentType): Promise<Offer> {
	const offers = await client.getOffers();

	let selectedOffer: Offer | undefined;

	for (const offer of offers.offers.reverse()) {
		if (offer.offer_type === offerType &&
			(!contentType || offer.content_type === contentType)) {
			selectedOffer = offer;
		}
	}
	if (!selectedOffer) {
		throw new Error(`did not find a ${ offerType }:${ contentType } offer`);
	}
	return selectedOffer;
}

/**
 * helper to expect a function to throw
 */
async function expectToThrow(func: () => any, error: string): Promise<Error> {
	try {
		await func();
	} catch (e) {
		// ok
		return e;
	}
	throw new Error("expected to throw: " + error);
}

async function didNotApproveTOS() {
	console.log("===================================== didNotApproveTOS =====================================");

	const userId = generateId();
	const deviceId = generateId();
	const appClient = new SampleAppClient(SMPL_APP_CONFIG.jwtAddress);
	const jwt = await appClient.getRegisterJWT(userId, deviceId);
	const client = await MarketplaceClient.create({ jwt });
	await client.updateWallet(SMPL_APP_CONFIG.keypair.publicKey());

	const offers = await client.getOffers();
	await client.createOrder(offers.offers[0].id); // should not throw - we removed need of activate
	console.log("OK.\n");
}

async function v1DidNotApproveTOS() {
	console.log("===================================== didNotApproveTOS V1 =====================================");

	const userId = generateId();
	const appClient = new SampleAppClient(SMPL_APP_CONFIG.jwtAddress);
	const jwt = await appClient.getV1RegisterJWT(userId);
	const client = await V1MarketplaceClient.create({ jwt }, SMPL_APP_CONFIG.keypair.publicKey());

	const offers = await client.getOffers();
	await client.createOrder(offers.offers[0].id); // should not throw - we removed need of activate
	console.log("OK.\n");
}

async function getOfferTranslations() {
	console.log("=====================================getOfferTranslations=====================================");
	const userId = generateId();
	const appClient = new SampleAppClient(SMPL_APP_CONFIG.jwtAddress);
	const jwt = await appClient.getV1RegisterJWT(userId);

	const client = await V1MarketplaceClient.create({ jwt },
		SMPL_APP_CONFIG.keypair.publicKey(),
		{ headers: { "accept-language": "pt-BR" } });

	const offers = await client.getOffers();
	//  We don't know the order of the offers received but some must have this title
	// console.log("offers.offers:", offers.offers);
	console.log("Title text (at least some should be translated):");
	expect(offers.offers.filter(o => {
		console.log("offer id: %s, title: ", o.id, o.title);
		return o.title === "Faça um teste";
	}).length).toBeGreaterThan(0);

	console.log("OK.\n");
}

async function getOffersVersionSpecificImages() {
	console.log("=====================================getOffersVersionSpecificImages=====================================");
	const userId = generateId();
	const deviceId = generateId();
	const appClient = new SampleAppClient(SMPL_APP_CONFIG.jwtAddress);
	const jwt = await appClient.getRegisterJWT(userId, deviceId);
	const client = await MarketplaceClient.create({ jwt });
	const client2 = await MarketplaceClient.create({ jwt },
		{ sdkVersion: "1.0.5" });

	const offers1 = await client.getOffers();
	const offers2 = await client2.getOffers();
	const pollDescription = "What's your take?";
	const offer1 = offers1.offers.find((o: Offer) => o.description === pollDescription)!;
	const offer2 = offers2.offers.find((o: Offer) => o.description === pollDescription)!;
	expect(offer1.image).toBe("https://cdn.kinecosystem.com/thumbnails/offers/earn-cover-images-v2/answer_poll.png");
	expect(offer2.image).toBe("https://cdn.kinecosystem.com/thumbnails/offers/222x222/Generic_7.png");

	console.log("OK.\n");

}

async function spendFlow() {
	console.log("===================================== spendFlow =====================================");

	const userId = generateId();
	const deviceId = generateId();
	const appClient = new SampleAppClient(SMPL_APP_CONFIG.jwtAddress);
	const jwt = await appClient.getRegisterJWT(userId, deviceId);
	const client = await MarketplaceClient.create({ jwt });
	await client.updateWallet(SMPL_APP_CONFIG.keypair.secret());

	await client.activate();
	const selectedOffer = await getOffer(client, "spend");
	const couponInfo: CouponInfo = JSON.parse(selectedOffer.content);

	expect(couponInfo.amount).toEqual(selectedOffer.amount);

	console.log(`requesting order for offer: ${ selectedOffer.id }: ${ selectedOffer.content }`);
	const openOrder = await client.createOrder(selectedOffer.id);
	console.log(`got open order`, openOrder);

	// pay for the offer
	await client.submitOrder(openOrder.id);

	const res = await client.pay(selectedOffer.blockchain_data.recipient_address!, selectedOffer.amount, openOrder.id);

	console.log("pay result hash: " + res.hash);

	// poll on order payment
	const order = await retry(() => client.getOrder(openOrder.id), order => order.status === "completed", "order did not turn completed");
	console.log(`completion date: ${ order.completion_date }`);
	console.log(`got order after submit`, order);
	console.log(`order history`, (await client.getOrders()).orders.slice(0, 2));

	JSON.parse(order.content!);

	console.log("OK.\n");
}

async function kin3SpendFlow() {
	console.log("===================================== kin3SpendFlow =====================================");

	const userId = generateId();
	const deviceId = generateId();
	const appClient = new SampleAppClient(SMP3_APP_CONFIG.jwtAddress);
	const jwt = await appClient.getRegisterJWT(userId, deviceId);
	const client = await MarketplaceClient.create({ jwt });
	await client.updateWallet(SMP3_APP_CONFIG.keypair.secret());

	await client.activate();
	const selectedOffer = await getOffer(client, "spend");
	const couponInfo: CouponInfo = JSON.parse(selectedOffer.content);

	expect(couponInfo.amount).toEqual(selectedOffer.amount);

	console.log(`requesting order for offer: ${ selectedOffer.id }: ${ selectedOffer.content }`);
	const openOrder = await client.createOrder(selectedOffer.id);
	console.log(`got open order`, openOrder);

	// pay for the offer
	const transaction = await client.getTransactionXdr(openOrder.blockchain_data.recipient_address!, selectedOffer.amount, openOrder.id);
	console.log("transaction XDR: " + transaction);
	await client.submitOrder(openOrder.id, { transaction });

	// poll on order payment
	const order = await retry(() => client.getOrder(openOrder.id), order => order.status === "completed", "order did not turn completed");
	console.log(`completion date: ${ order.completion_date }`);
	console.log(`got order after submit`, order);
	console.log(`order history`, (await client.getOrders()).orders.slice(0, 2));

	JSON.parse(order.content!);

	console.log("OK.\n");
}

async function v1SpendFlow() {
	console.log("===================================== spendFlow V1 =====================================");

	const userId = generateId();
	const appClient = new SampleAppClient(SMPL_APP_CONFIG.jwtAddress);
	const jwt = await appClient.getV1RegisterJWT(userId);
	const client = await V1MarketplaceClient.create({ jwt }, SMPL_APP_CONFIG.keypair.secret());

	await client.activate();
	const selectedOffer = await getOffer(client, "spend");
	const couponInfo: CouponInfo = JSON.parse(selectedOffer.content);

	expect(couponInfo.amount).toEqual(selectedOffer.amount);

	console.log(`requesting order for offer: ${ selectedOffer.id }: ${ selectedOffer.content }`);
	const openOrder = await client.createOrder(selectedOffer.id);
	console.log(`got open order`, openOrder);

	// pay for the offer
	await client.submitOrder(openOrder.id); // XXX allow the flow where this line is missing
	const res = await client.pay(selectedOffer.blockchain_data.recipient_address!, selectedOffer.amount, openOrder.id);

	console.log("pay result hash: " + res.hash);

	// poll on order payment
	const order = await retry(() => client.getOrder(openOrder.id), order => order.status === "completed", "order did not turn completed");
	console.log(`completion date: ${ order.completion_date }`);
	console.log(`got order after submit`, order);
	console.log(`order history`, (await client.getOrders()).orders.slice(0, 2));

	const couponOrderContent: CouponOrderContent = JSON.parse(order.content!);

	console.log("OK.\n");
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
			answers[p.question.id] = choice;
		}
		return answers;
	}

	console.log("===================================== earnPollFlow =====================================");

	const userId = generateId();
	const deviceId = generateId();
	const appClient = new SampleAppClient(SMPL_APP_CONFIG.jwtAddress);
	const jwt = await appClient.getRegisterJWT(userId, deviceId);
	const client = await MarketplaceClient.create({ jwt });
	await client.updateWallet(SMPL_APP_CONFIG.keypair.publicKey());

	await client.activate();

	const selectedOffer = await getOffer(client, "earn", "poll");

	console.log(`requesting order for offer: ${ selectedOffer.id }: ${ selectedOffer.content }`);
	const openOrder = await client.createOrder(selectedOffer.id);
	console.log(`got open order`, openOrder);

	// fill in the poll
	console.log("poll " + selectedOffer.content);
	const poll: Poll = JSON.parse(selectedOffer.content);

	const content = JSON.stringify(choosePollAnswers(poll));
	console.log("answers " + content);

	const submittedOrder = await client.submitOrder(openOrder.id, { content });
	expect(typeof submittedOrder.amount).toBe("number");

	// poll on order payment
	const order = await retry(() => client.getOrder(openOrder.id), order => order.status === "completed", "order did not turn completed");

	console.log(`completion date: ${ order.completion_date }`);

	// check order on blockchain
	const payment = (await retry(() => client.findKinPayment(order.id), payment => !!payment, "failed to find payment on blockchain"))!;

	console.log(`got order after submit`, order);
	console.log(`order history`, (await client.getOrders()).orders.slice(0, 2));
	console.log(`payment on blockchain:`, payment);

	if (!isValidPayment(order, client.appId, payment)) {
		throw new Error("payment is not valid - different than order");
	}

	console.log("OK.\n");
}

async function kin3EarnPollFlow() {
	function choosePollAnswers(poll: Poll): Answers {
		const answers: Answers = {};
		for (const page of poll.pages.slice(0, poll.pages.length - 1)) {
			const p = (page as PollPage);
			const choice = randomInteger(0, p.question.answers.length);
			answers[p.question.id] = choice;
		}
		return answers;
	}

	console.log("===================================== kin3EarnPollFlow =====================================");

	const userId = generateId();
	const deviceId = generateId();
	const appClient = new SampleAppClient(SMP3_APP_CONFIG.jwtAddress);
	const jwt = await appClient.getRegisterJWT(userId, deviceId);
	const client = await MarketplaceClient.create({ jwt });
	await client.updateWallet(SMP3_APP_CONFIG.keypair.publicKey());

	await client.activate();

	const selectedOffer = await getOffer(client, "earn", "poll");

	console.log(`requesting order for offer: ${ selectedOffer.id }: ${ selectedOffer.content }`);
	const openOrder = await client.createOrder(selectedOffer.id);
	console.log(`got open order`, openOrder);

	// fill in the poll
	console.log("poll " + selectedOffer.content);
	const poll: Poll = JSON.parse(selectedOffer.content);

	const content = JSON.stringify(choosePollAnswers(poll));
	console.log("answers " + content);

	const submittedOrder = await client.submitOrder(openOrder.id, { content });
	expect(typeof submittedOrder.amount).toBe("number");

	// poll on order payment
	const order = await retry(() => client.getOrder(openOrder.id), order => order.status === "completed", "order did not turn completed");

	console.log(`completion date: ${ order.completion_date }`);

	// check order on blockchain
	const payment = (await retry(() => client.findKinPayment(order.id), payment => !!payment, "failed to find payment on blockchain"))!;

	console.log(`got order after submit`, order);
	console.log(`order history`, (await client.getOrders()).orders.slice(0, 2));
	console.log(`payment on blockchain:`, payment);

	if (!isValidPayment(order, client.appId, payment)) {
		throw new Error("payment is not valid - different than order");
	}

	console.log("OK.\n");
}

async function v1EarnPollFlow() {
	console.log("===================================== earn poll V1 =====================================");

	function choosePollAnswers(poll: Poll): Answers {
		const answers: Answers = {};
		for (const page of poll.pages.slice(0, poll.pages.length - 1)) {
			const p = (page as PollPage);
			const choice = randomInteger(0, p.question.answers.length);
			answers[p.question.id] = choice;
		}
		return answers;
	}

	const userId = generateId();
	const appClient = new SampleAppClient(SMPL_APP_CONFIG.jwtAddress);
	const jwt = await appClient.getV1RegisterJWT(userId);
	const client = await V1MarketplaceClient.create({ jwt }, SMPL_APP_CONFIG.keypair.publicKey());

	await client.activate();

	const selectedOffer = await getOffer(client, "earn", "poll");

	console.log(`requesting order for offer: ${ selectedOffer.id }: ${ selectedOffer.content }`);
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

	console.log(`completion date: ${ order.completion_date }`);

	// check order on blockchain
	const payment = (await retry(() => client.findKinPayment(order.id), payment => !!payment, "failed to find payment on blockchain"))!;

	console.log(`got order after submit`, order);
	console.log(`order history`, (await client.getOrders()).orders.slice(0, 2));
	console.log(`payment on blockchain:`, payment);

	if (!isValidPayment(order, client.appId, payment)) {
		throw new Error("payment is not valid - different than order");
	}

	console.log("OK.\n");
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
			answers[p.question.id] = choice;
		}
		return [answers, sum || 1]; // server will give 1 kin for failed quizes
	}

	console.log("===================================== earnQuizFlow =====================================");

	const userId = generateId();
	const deviceId = generateId();
	const appClient = new SampleAppClient(SMPL_APP_CONFIG.jwtAddress);
	const jwt = await appClient.getRegisterJWT(userId, deviceId);
	const client = await MarketplaceClient.create({ jwt });
	await client.updateWallet(SMPL_APP_CONFIG.keypair.publicKey());

	await client.activate();

	const selectedOffer = await getOffer(client, "earn", "quiz");

	console.log(`requesting order for offer: ${ selectedOffer.id }: ${ selectedOffer.content }`);
	const openOrder = await client.createOrder(selectedOffer.id);
	console.log(`got open order`, openOrder);

	// answer the quiz
	console.log("quiz " + selectedOffer.content);
	const quiz: Quiz = JSON.parse(selectedOffer.content);

	// TODO write a function to choose the right/ wrong answers
	const [answers, expectedSum] = chooseAnswers(quiz);
	const content = JSON.stringify(answers);
	console.log("answers " + content, " expected sum " + expectedSum);

	await client.submitOrder(openOrder.id, { content });

	// poll on order payment
	const order = await retry(() => client.getOrder(openOrder.id), order => order.status === "completed", "order did not turn completed");
	console.log(`completion date: ${ order.completion_date }`);
	expect(order.amount).toEqual(expectedSum);

	// check order on blockchain
	const payment = (await retry(() => client.findKinPayment(order.id), payment => !!payment, "failed to find payment on blockchain"))!;

	console.log(`got order after submit`, order);
	console.log(`order history`, (await client.getOrders()).orders.slice(0, 2));
	console.log(`payment on blockchain:`, payment);

	if (!isValidPayment(order, client.appId, payment)) {
		throw new Error("payment is not valid - different than order");
	}

	console.log("OK.\n");
}

async function kin3EarnQuizFlow() {
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
			answers[p.question.id] = choice;
		}
		return [answers, sum || 1]; // server will give 1 kin for failed quizes
	}

	console.log("===================================== kin3EarnQuizFlow =====================================");

	const userId = generateId();
	const deviceId = generateId();
	const appClient = new SampleAppClient(SMP3_APP_CONFIG.jwtAddress);
	const jwt = await appClient.getRegisterJWT(userId, deviceId);
	const client = await MarketplaceClient.create({ jwt });
	await client.updateWallet(SMP3_APP_CONFIG.keypair.publicKey());

	await client.activate();

	const selectedOffer = await getOffer(client, "earn", "quiz");

	console.log(`requesting order for offer: ${ selectedOffer.id }: ${ selectedOffer.content }`);
	const openOrder = await client.createOrder(selectedOffer.id);
	console.log(`got open order`, openOrder);

	// answer the quiz
	console.log("quiz " + selectedOffer.content);
	const quiz: Quiz = JSON.parse(selectedOffer.content);

	// TODO write a function to choose the right/ wrong answers
	const [answers, expectedSum] = chooseAnswers(quiz);
	const content = JSON.stringify(answers);
	console.log("answers " + content, " expected sum " + expectedSum);

	await client.submitOrder(openOrder.id, { content });

	// poll on order payment
	const order = await retry(() => client.getOrder(openOrder.id), order => order.status === "completed", "order did not turn completed");
	console.log(`completion date: ${ order.completion_date }`);
	expect(order.amount).toEqual(expectedSum);

	// check order on blockchain
	const payment = (await retry(() => client.findKinPayment(order.id), payment => !!payment, "failed to find payment on blockchain"))!;

	console.log(`got order after submit`, order);
	console.log(`order history`, (await client.getOrders()).orders.slice(0, 2));
	console.log(`payment on blockchain:`, payment);

	if (!isValidPayment(order, client.appId, payment)) {
		throw new Error("payment is not valid - different than order");
	}

	console.log("OK.\n");
}

async function v1EarnQuizFlow() {
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
			answers[p.question.id] = choice;
		}
		return [answers, sum || 1]; // server will give 1 kin for failed quizes
	}

	console.log("===================================== earnQuizFlow V1 =====================================");

	const userId = generateId();
	const appClient = new SampleAppClient(SMPL_APP_CONFIG.jwtAddress);
	const jwt = await appClient.getV1RegisterJWT(userId);
	const client = await V1MarketplaceClient.create({ jwt }, SMPL_APP_CONFIG.keypair.publicKey());

	await client.activate();

	const selectedOffer = await getOffer(client, "earn", "quiz");

	console.log(`requesting order for offer: ${ selectedOffer.id }: ${ selectedOffer.content }`);
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
	console.log(`completion date: ${ order.completion_date }`);
	expect(order.amount).toEqual(expectedSum);

	// check order on blockchain
	const payment = (await retry(() => client.findKinPayment(order.id), payment => !!payment, "failed to find payment on blockchain"))!;

	console.log(`got order after submit`, order);
	console.log(`order history`, (await client.getOrders()).orders.slice(0, 2));
	console.log(`payment on blockchain:`, payment);

	if (!isValidPayment(order, client.appId, payment)) {
		throw new Error("payment is not valid - different than order");
	}

	console.log("OK.\n");
}

async function earnTutorial() {
	console.log("===================================== earnTutorial =====================================");
	const userId = generateId();
	const deviceId = generateId();
	const appClient = new SampleAppClient(SMPL_APP_CONFIG.jwtAddress);
	const jwt = await appClient.getRegisterJWT(userId, deviceId);
	const client = await MarketplaceClient.create({ jwt });
	await client.updateWallet(SMPL_APP_CONFIG.keypair.publicKey());

	await client.activate();

	const selectedOffer = await getOffer(client, "earn", "tutorial");

	console.log(`requesting order for offer: ${ selectedOffer.id }: ${ selectedOffer.content.slice(0, 100) }`);
	const openOrder = await client.createOrder(selectedOffer.id);
	console.log(`got order ${ openOrder.id }`);

	const content = JSON.stringify({});

	await client.submitOrder(openOrder.id, { content });
	const order = await retry(() => client.getOrder(openOrder.id), order => order.status === "completed", "order did not turn completed");

	console.log(`completion date: ${ order.completion_date }`);
	console.log(`got order after submit`, order);
	console.log(`order history`, (await client.getOrders()).orders.slice(0, 2));

	// shouldn't have another tutorial
	await expectToThrow(() => getOffer(client, "earn", "tutorial"), "should only solve 1 tutorial");
	console.log("OK.\n");
}

async function kin3EarnTutorial() {
	console.log("===================================== kin3EarnTutorial =====================================");
	const userId = generateId();
	const deviceId = generateId();
	const appClient = new SampleAppClient(SMP3_APP_CONFIG.jwtAddress);
	const jwt = await appClient.getRegisterJWT(userId, deviceId);
	const client = await MarketplaceClient.create({ jwt });
	await client.updateWallet(SMP3_APP_CONFIG.keypair.publicKey());

	await client.activate();

	const selectedOffer = await getOffer(client, "earn", "tutorial");

	console.log(`requesting order for offer: ${ selectedOffer.id }: ${ selectedOffer.content.slice(0, 100) }`);
	const openOrder = await client.createOrder(selectedOffer.id);
	console.log(`got order ${ openOrder.id }`);

	const content = JSON.stringify({});

	await client.submitOrder(openOrder.id, { content });
	const order = await retry(() => client.getOrder(openOrder.id), order => order.status === "completed", "order did not turn completed");

	console.log(`completion date: ${ order.completion_date }`);
	console.log(`got order after submit`, order);
	console.log(`order history`, (await client.getOrders()).orders.slice(0, 2));

	// shouldn't have another tutorial
	await expectToThrow(() => getOffer(client, "earn", "tutorial"), "should only solve 1 tutorial");
	console.log("OK.\n");
}

async function v1EarnTutorial() {
	console.log("===================================== earnTutorial V1 =====================================");
	const userId = generateId();
	const appClient = new SampleAppClient(SMPL_APP_CONFIG.jwtAddress);
	const jwt = await appClient.getV1RegisterJWT(userId);
	const client = await V1MarketplaceClient.create({ jwt }, SMPL_APP_CONFIG.keypair.publicKey());

	await client.activate();

	const selectedOffer = await getOffer(client, "earn", "tutorial");

	console.log(`requesting order for offer: ${ selectedOffer.id }: ${ selectedOffer.content.slice(0, 100) }`);
	const openOrder = await client.createOrder(selectedOffer.id);
	console.log(`got order ${ openOrder.id }`);

	const content = JSON.stringify({});

	await client.submitOrder(openOrder.id, content);
	const order = await retry(() => client.getOrder(openOrder.id), order => order.status === "completed", "order did not turn completed");

	console.log(`completion date: ${ order.completion_date }`);
	console.log(`got order after submit`, order);
	console.log(`order history`, (await client.getOrders()).orders.slice(0, 2));

	console.log("OK.\n");
}

async function testRegisterNewUser() {
	console.log("===================================== testRegisterNewUser =====================================");
	const userId = generateId();
	const deviceId = generateId();
	const appClient = new SampleAppClient(SMPL_APP_CONFIG.jwtAddress);
	const jwt = await appClient.getRegisterJWT(userId, deviceId);
	const client = await MarketplaceClient.create({ jwt });
	await client.updateWallet(SMPL_APP_CONFIG.keypair.secret());

	console.log("OK.\n");
}

async function v1TestRegisterNewUser() {
	console.log("===================================== testRegisterNewUser V1 =====================================");
	const userId = generateId();
	const appClient = new SampleAppClient(SMPL_APP_CONFIG.jwtAddress);
	const jwt = await appClient.getV1RegisterJWT(userId);
	await V1MarketplaceClient.create({ jwt });

	console.log("OK.\n");
}

async function registerJWT() {
	console.log("===================================== registerJWT =====================================");

	const userId = generateId();
	const deviceId = generateId();
	const appClient = new SampleAppClient(SMPL_APP_CONFIG.jwtAddress);

	const jwt = await appClient.getRegisterJWT(userId, deviceId);
	const client = await MarketplaceClient.create({ jwt });
	await client.updateWallet(SMPL_APP_CONFIG.keypair.secret());

	console.log("OK.\n");
}

async function v1RegisterJWT() {
	console.log("===================================== registerJWT V1 =====================================");

	const userId = generateId();
	const appClient = new SampleAppClient(SMPL_APP_CONFIG.jwtAddress);

	const jwt = await appClient.getV1RegisterJWT(userId);
	await V1MarketplaceClient.create({ jwt });

	console.log("OK.\n");
}

async function extraTrustlineIsOK() {
	console.log("===================================== extraTrustlineIsOK =====================================");
	const userId = generateId();
	const deviceId = generateId();
	const appClient = new SampleAppClient(SMPL_APP_CONFIG.jwtAddress);

	const jwt = await appClient.getRegisterJWT(userId, deviceId);
	const client = await MarketplaceClient.create({ jwt });
	await client.updateWallet(SMPL_APP_CONFIG.keypair.secret());

	await client.trustKin(); // should not throw
	console.log("OK.\n");
}

async function v1ExtraTrustlineIsOK() {
	console.log("===================================== extraTrustlineIsOK V1 =====================================");
	const userId = generateId();
	const appClient = new SampleAppClient(SMPL_APP_CONFIG.jwtAddress);

	const jwt = await appClient.getV1RegisterJWT(userId);
	const client = await V1MarketplaceClient.create({ jwt });

	await client.trustKin(); // should not throw
	console.log("OK.\n");
}

async function outdatedJWT() {
	console.log("===================================== outdatedJWT =====================================");

	const userId = generateId();
	const deviceId = generateId();
	const appClient = new SampleAppClient(SMPL_APP_CONFIG.jwtAddress);

	let jwt = await appClient.getRegisterJWT(userId, deviceId, moment().add(1, "days").unix());
	await expectToThrow(() => MarketplaceClient.create({ jwt }),
		"shouldn't be able to register with JWT with iat in the future");

	jwt = await appClient.getRegisterJWT(userId, deviceId, moment().unix(), moment().subtract(1, "days").unix());

	// should be able to register with JWT with exp in the past
	await MarketplaceClient.create({ jwt });

	console.log("OK.\n");
}

async function v1OutdatedJWT() {
	console.log("===================================== outdatedJWT V1 =====================================");

	const userId = generateId();
	const appClient = new SampleAppClient(SMPL_APP_CONFIG.jwtAddress);

	let jwt = await appClient.getV1RegisterJWT(userId, moment().add(1, "days").unix());
	try {
		await V1MarketplaceClient.create({ jwt });
		throw new Error("shouldn't be able to register with JWT with iat in the future");
	} catch (e) {
	}

	jwt = await appClient.getV1RegisterJWT(userId, moment().unix(), moment().subtract(1, "days").unix());
	try {
		await V1MarketplaceClient.create({ jwt });
		throw new Error("shouldn't be able to register with JWT with exp in the past");
	} catch (e) {
	}

	console.log("OK.\n");
}

async function updateWallet() {
	console.log("===================================== updateWallet =====================================");
	const userId = generateId();
	const deviceId = generateId();
	const appClient = new SampleAppClient(SMPL_APP_CONFIG.jwtAddress);

	const jwt = await appClient.getRegisterJWT(userId, deviceId);
	const client = await MarketplaceClient.create({ jwt });
	console.log("one");
	await client.updateWallet(SMPL_APP_CONFIG.keypair.secret());
	console.log("two");
	await client.updateWallet();
	console.log("OK.\n");
}

async function v1UpdateWallet() {
	console.log("===================================== updateWallet V1 =====================================");
	const userId = generateId();
	const appClient = new SampleAppClient(SMPL_APP_CONFIG.jwtAddress);

	const jwt = await appClient.getV1RegisterJWT(userId);
	const client = await V1MarketplaceClient.create({ jwt });
	console.log("Created client 1");
	const client2 = await V1MarketplaceClient.create({ jwt });
	console.log("Created client 2");
	await client.updateWallet(client2.wallet.address);
	console.log("OK.\n");
}

async function nativeSpendFlow() {
	console.log("===================================== nativeSpendFlow =====================================");

	// this address is prefunded with test kin
	const userId = "test:rich_user:" + generateId();
	const deviceId = generateId();
	const appClient = new SampleAppClient(SMPL_APP_CONFIG.jwtAddress);
	const jwt = await appClient.getRegisterJWT(userId, deviceId);

	const client = await MarketplaceClient.create({ jwt });
	await client.updateWallet(SMPL_APP_CONFIG.keypair.secret());
	await client.activate();

	const selectedOffer = (await appClient.getOffers())[0] as ExternalOfferPayload;
	const offerJwt = await appClient.getSpendJWT(userId, deviceId, selectedOffer.id);
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

	console.log(`completion date: ${ order.completion_date }`);

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
	expect(jwtPayload.payload.nonce).toEqual(DbOrder.DEFAULT_NONCE);
	// verify using kin public key
	expect(await appClient.isValidSignature(paymentJwt)).toBeTruthy();

	console.log("OK.\n");
}

async function v1NativeSpendFlow() {
	console.log("===================================== nativeSpendFlow V1 =====================================");

	// this address is prefunded with test kin
	const userId = "test:rich_user:" + generateId();
	const appClient = new SampleAppClient(SMPL_APP_CONFIG.jwtAddress);
	const jwt = await appClient.getV1RegisterJWT(userId);

	const client = await V1MarketplaceClient.create({ jwt }, SMPL_APP_CONFIG.keypair.secret());
	await client.activate();

	const selectedOffer = (await appClient.getOffers())[0] as ExternalOfferPayload;
	const offerJwt = await appClient.getV1SpendJWT(selectedOffer.id);
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

	console.log(`completion date: ${ order.completion_date }`);

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
	expect(jwtPayload.payload.nonce).toEqual(DbOrder.DEFAULT_NONCE);
	// verify using kin public key
	expect(await appClient.isValidSignature(paymentJwt)).toBeTruthy();

	console.log("OK.\n");
}

async function tryToNativeSpendTwice() {
	console.log("===================================== tryToNativeSpendTwice =====================================");

	const userId = "rich_user:" + generateId();
	const deviceId = generateId();
	const appClient = new SampleAppClient(SMPL_APP_CONFIG.jwtAddress);
	const jwt = await appClient.getRegisterJWT(userId, deviceId);

	const client = await MarketplaceClient.create({ jwt });
	await client.updateWallet(SMPL_APP_CONFIG.keypair.secret());
	await client.activate();

	const selectedOffer = (await appClient.getOffers())[0] as ExternalOfferPayload;
	const offerJwt = await appClient.getSpendJWT(userId, deviceId, selectedOffer.id);
	const openOrder = await client.createExternalOrder(offerJwt);
	console.log(`created order`, openOrder.id, `for offer`, selectedOffer.id);

	// pay for the offer
	const res = await client.pay(openOrder.blockchain_data.recipient_address!, selectedOffer.amount, openOrder.id);
	console.log("pay result hash: " + res.hash);
	await client.submitOrder(openOrder.id);

	// poll on order payment
	const order = await retry(() => client.getOrder(openOrder.id), order => order.status === "completed", "order did not turn completed");

	console.log(`completed order`, order.id);
	const offerJwt2 = await appClient.getSpendJWT(userId, deviceId, selectedOffer.id);
	// should not allow to create a new order
	console.log(`expecting error for new order`, selectedOffer.id);

	const e = await expectToThrow(() => client.createExternalOrder(offerJwt2),
		"should not allow to create more than one order");
	expect((e as ClientError).response!.headers.location).toEqual(`/v1/orders/${ order.id }`);

	console.log("OK.\n");
}

async function v1TryToNativeSpendTwice() {
	console.log("===================================== tryToNativeSpendTwice V1 =====================================");

	const userId = "rich_user:" + generateId();
	const appClient = new SampleAppClient(SMPL_APP_CONFIG.jwtAddress);
	const jwt = await appClient.getV1RegisterJWT(userId);

	const client = await V1MarketplaceClient.create({ jwt }, SMPL_APP_CONFIG.keypair.secret());
	await client.activate();

	const selectedOffer = (await appClient.getOffers())[0] as ExternalOfferPayload;
	const offerJwt = await appClient.getV1SpendJWT(selectedOffer.id);
	const openOrder = await client.createExternalOrder(offerJwt);
	console.log(`created order`, openOrder.id, `for offer`, selectedOffer.id);

	// pay for the offer
	const res = await client.pay(openOrder.blockchain_data.recipient_address!, selectedOffer.amount, openOrder.id);
	console.log("pay result hash: " + res.hash);
	await client.submitOrder(openOrder.id);

	// poll on order payment
	const order = await retry(() => client.getOrder(openOrder.id), order => order.status === "completed", "order did not turn completed");

	console.log(`completed order`, order.id);
	const offerJwt2 = await appClient.getV1SpendJWT(selectedOffer.id);
	// should not allow to create a new order
	console.log(`expecting error for new order`, selectedOffer.id);

	let errorThrown: boolean;
	try {
		await client.createExternalOrder(offerJwt2);
		errorThrown = false;
	} catch (e) {
		errorThrown = true;
		expect((e as ClientError).response!.headers.location).toEqual(`/v1/orders/${ order.id }`);
		// ok
	}

	if (!errorThrown) {
		throw new Error("should not allow to create more than one order");
	}

	console.log("OK.\n");
}

async function tryToNativeSpendTwiceWithNonce() {
	console.log("===================================== tryToNativeSpendTwiceWithNonce =====================================");

	const userId = "rich_user:" + generateId();
	const deviceId = generateId();
	const appClient = new SampleAppClient(SMPL_APP_CONFIG.jwtAddress);
	const jwt = await appClient.getRegisterJWT(userId, deviceId);

	const client = await MarketplaceClient.create({ jwt });
	await client.updateWallet(SMPL_APP_CONFIG.keypair.secret());
	await client.activate();

	const selectedOffer = (await appClient.getOffers())[0] as ExternalOfferPayload;
	const offerJwt = await appClient.getSpendJWT(userId, deviceId, selectedOffer.id, "nonce:one");
	const openOrder = await client.createExternalOrder(offerJwt);
	console.log(`created order ${ openOrder.id } (nonce ${ openOrder.nonce }) for offer ${ selectedOffer.id }`);

	// pay for the offer
	let res = await client.pay(openOrder.blockchain_data.recipient_address!, selectedOffer.amount, openOrder.id);
	console.log("pay result hash: " + res.hash);
	await client.submitOrder(openOrder.id);

	// poll on order payment
	let order = await retry(() => client.getOrder(openOrder.id), order => order.status === "completed", "order did not turn completed");
	let payment = (await retry(() => client.findKinPayment(order.id), payment => !!payment, "failed to find payment on blockchain"))!;
	expect(payment).toBeDefined();
	expect(isValidPayment(order, client.appId, payment)).toBeTruthy();
	let paymentJwt = (order.result! as JWTValue).jwt;
	let jwtPayload = jsonwebtoken.decode(paymentJwt, { complete: true }) as JWTContent<JWTBodyPaymentConfirmation, "payment_confirmation">;
	expect(jwtPayload.payload.nonce).toEqual("nonce:one");

	console.log(`completed order`, order.id);
	const offerJwt2 = await appClient.getSpendJWT(userId, deviceId, selectedOffer.id, "nonce:two");
	// should allow to create a new order
	const openOrder2 = await client.createExternalOrder(offerJwt2);
	console.log(`created order ${ openOrder2.id } (nonce ${ openOrder2.nonce }) for offer ${ selectedOffer.id }`);

	// pay for the offer
	res = await client.pay(openOrder2.blockchain_data.recipient_address!, selectedOffer.amount, openOrder2.id);
	console.log("pay result hash: " + res.hash);
	await client.submitOrder(openOrder2.id);

	order = await retry(() => client.getOrder(openOrder2.id), order => order.status === "completed", "order did not turn completed");
	payment = (await retry(() => client.findKinPayment(order.id), payment => !!payment, "failed to find payment on blockchain"))!;
	expect(payment).toBeDefined();
	expect(isValidPayment(order, client.appId, payment)).toBeTruthy();
	paymentJwt = (order.result! as JWTValue).jwt;
	jwtPayload = jsonwebtoken.decode(paymentJwt, { complete: true }) as JWTContent<JWTBodyPaymentConfirmation, "payment_confirmation">;
	expect(jwtPayload.payload.nonce).toEqual("nonce:two");

	console.log("OK.\n");
}

async function v1TryToNativeSpendTwiceWithNonce() {
	console.log("===================================== tryToNativeSpendTwiceWithNonce V1 =====================================");

	const userId = "rich_user:" + generateId();
	const appClient = new SampleAppClient(SMPL_APP_CONFIG.jwtAddress);
	const jwt = await appClient.getV1RegisterJWT(userId);

	const client = await V1MarketplaceClient.create({ jwt }, SMPL_APP_CONFIG.keypair.secret());
	await client.activate();

	const selectedOffer = (await appClient.getOffers())[0] as ExternalOfferPayload;
	const offerJwt = await appClient.getV1SpendJWT(selectedOffer.id, "nonce:one");
	const openOrder = await client.createExternalOrder(offerJwt);
	console.log(`created order ${ openOrder.id } (nonce ${ openOrder.nonce }) for offer ${ selectedOffer.id }`);

	// pay for the offer
	let res = await client.pay(openOrder.blockchain_data.recipient_address!, selectedOffer.amount, openOrder.id);
	console.log("pay result hash: " + res.hash);
	await client.submitOrder(openOrder.id);

	// poll on order payment
	let order = await retry(() => client.getOrder(openOrder.id), order => order.status === "completed", "order did not turn completed");
	let payment = (await retry(() => client.findKinPayment(order.id), payment => !!payment, "failed to find payment on blockchain"))!;
	expect(payment).toBeDefined();
	expect(isValidPayment(order, client.appId, payment)).toBeTruthy();
	let paymentJwt = (order.result! as JWTValue).jwt;
	let jwtPayload = jsonwebtoken.decode(paymentJwt, { complete: true }) as JWTContent<JWTBodyPaymentConfirmation, "payment_confirmation">;
	expect(jwtPayload.payload.nonce).toEqual("nonce:one");

	console.log(`completed order`, order.id);
	const offerJwt2 = await appClient.getV1SpendJWT(selectedOffer.id, "nonce:two");
	// should allow to create a new order
	const openOrder2 = await client.createExternalOrder(offerJwt2);
	console.log(`created order ${ openOrder2.id } (nonce ${ openOrder2.nonce }) for offer ${ selectedOffer.id }`);

	// pay for the offer
	res = await client.pay(openOrder2.blockchain_data.recipient_address!, selectedOffer.amount, openOrder2.id);
	console.log("pay result hash: " + res.hash);
	await client.submitOrder(openOrder2.id);

	order = await retry(() => client.getOrder(openOrder2.id), order => order.status === "completed", "order did not turn completed");
	payment = (await retry(() => client.findKinPayment(order.id), payment => !!payment, "failed to find payment on blockchain"))!;
	expect(payment).toBeDefined();
	expect(isValidPayment(order, client.appId, payment)).toBeTruthy();
	paymentJwt = (order.result! as JWTValue).jwt;
	jwtPayload = jsonwebtoken.decode(paymentJwt, { complete: true }) as JWTContent<JWTBodyPaymentConfirmation, "payment_confirmation">;
	expect(jwtPayload.payload.nonce).toEqual("nonce:two");

	console.log("OK.\n");
}

async function nativeEarnFlow() {
	console.log("===================================== nativeEarnFlow =====================================");

	// this address is prefunded with test kin
	const userId = "test:" + generateId();
	const deviceId = generateId();
	const appClient = new SampleAppClient(SMPL_APP_CONFIG.jwtAddress);
	const jwt = await appClient.getRegisterJWT(userId, deviceId);

	const client = await MarketplaceClient.create({ jwt });
	await client.updateWallet(SMPL_APP_CONFIG.keypair.publicKey());
	await client.activate();

	const selectedOffer = (await appClient.getOffers()).filter((item: any) => item.type === "earn")[0] as ExternalOfferPayload;
	const offerJwt = await appClient.getEarnJWT(userId, deviceId, selectedOffer.id);
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

	console.log(`completion date: ${ order.completion_date }`);

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

	console.log("OK.\n");
}

async function v1NativeEarnFlow() {
	console.log("===================================== nativeEarnFlow V1 =====================================");

	// this address is prefunded with test kin
	const userId = "test:" + generateId();
	const appClient = new SampleAppClient(SMPL_APP_CONFIG.jwtAddress);
	const jwt = await appClient.getV1RegisterJWT(userId);

	const client = await V1MarketplaceClient.create({ jwt }, SMPL_APP_CONFIG.keypair.publicKey());
	await client.activate();

	const selectedOffer = (await appClient.getOffers()).filter((item: any) => item.type === "earn")[0] as ExternalOfferPayload;
	const offerJwt = await appClient.getV1EarnJWT(userId, selectedOffer.id);
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

	console.log(`completion date: ${ order.completion_date }`);

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

	console.log("OK.\n");
}

async function p2p() {
	console.log("===================================== P2P =====================================");

	const offer = {
		id: "offer-id",
		amount: 2,
	};
	const appClient = new SampleAppClient(SMPL_APP_CONFIG.jwtAddress);
	const senderId = "test:rich_user:" + generateId();
	const senderDeviceId = generateId();
	let jwt = await appClient.getRegisterJWT(senderId, senderDeviceId);

	const senderPrivateKey = SMPL_APP_CONFIG.keypair.secret();
	const senderWalletAddress = SMPL_APP_CONFIG.keypair.publicKey();
	const senderClient = await MarketplaceClient.create({ jwt });
	await senderClient.updateWallet(senderPrivateKey);
	await senderClient.activate();

	const recipientId = "test:" + generateId();
	const recipientDeviceId = generateId();
	jwt = await appClient.getRegisterJWT(recipientId, recipientDeviceId);
	const recipientClient = await MarketplaceClient.create({ jwt });
	await recipientClient.updateWallet();
	await recipientClient.activate();

	jwt = await appClient.getP2PJWT({
		offer_id: offer.id,
		amount: offer.amount,
		user_id: senderId,
		device_id: senderDeviceId,
		sender_title: "sent moneys",
		sender_description: "money sent to test p2p",
		recipient_id: recipientId,
		recipient_title: "get moneys",
		recipient_description: "money received from p2p testing"
	});

	let openOrder = await senderClient.createExternalOrder(jwt);
	expect(openOrder.offer_type).toBe("spend");
	expect(openOrder.blockchain_data.sender_address).toEqual(senderWalletAddress);

	// pay for the offer
	const res = await senderClient.pay(openOrder.blockchain_data.recipient_address!, offer.amount, openOrder.id);
	console.log("pay result hash: " + res.hash);
	await senderClient.submitOrder(openOrder.id);

	// poll on order payment
	let order = await retry(() => senderClient.getOrder(openOrder.id), order => order.status === "completed", "order did not turn completed");
	console.log(`completion date: ${ order.completion_date }`);

	// find payment on blockchain
	let payment = (await retry(() => senderClient.findKinPayment(order.id), payment => !!payment, "failed to find payment on blockchain"))!;
	expect(payment).toBeDefined();
	expect(payment.sender_address).toEqual(senderWalletAddress);

	console.log("order.blockchain_data: ", order.blockchain_data);
	console.log(`payment on blockchain:`, payment);
	expect(isValidPayment(order, senderClient.appId, payment)).toBeTruthy();
	console.log(`got order after submit`, order);
	console.log(`order history`, (await senderClient.getOrders()).orders.slice(0, 2));

	expect(order.result!.type).toBe("payment_confirmation");
	const paymentJwt = (order.result! as JWTValue).jwt;
	const jwtPayload = jsonwebtoken.decode(paymentJwt, { complete: true }) as JWTContent<JWTBodyPaymentConfirmation, "payment_confirmation">;

	expect(jwtPayload.payload.offer_id).toBe(order.offer_id);
	expect(jwtPayload.payload.sender_user_id).toBe(senderId);
	expect(jwtPayload.payload.recipient_user_id).toBe(recipientId);
	expect(jwtPayload.header.kid).toBeDefined();
	expect(jwtPayload.payload.iss).toEqual("kin");
	expect(await appClient.isValidSignature(paymentJwt)).toBeTruthy();

	// check that paying yourself doesn't create an earn offer and causing you to earn kin
	const balanceBefore = await senderClient.wallet!.balance.update();
	jwt = await appClient.getP2PJWT({
		offer_id: "p2p2self",
		amount: 10,
		user_id: senderId,
		device_id: senderDeviceId,
		sender_title: "sent moneys",
		sender_description: "money sent to test p2p",
		recipient_id: senderId,
		recipient_title: "get moneys",
		recipient_description: "money received from p2p testing"
	});
	openOrder = await senderClient.createExternalOrder(jwt);
	expect(openOrder.blockchain_data.sender_address).toEqual(senderWalletAddress);
	await senderClient.pay(openOrder.blockchain_data.recipient_address!, 10, openOrder.id);
	await senderClient.submitOrder(openOrder.id);
	order = await retry(() => senderClient.getOrder(openOrder.id), order => order.status === "completed", "order did not turn completed");
	console.log(`completion date: ${ order.completion_date }`);
	payment = (await retry(() => senderClient.findKinPayment(order.id), payment => !!payment, "failed to find payment on blockchain"))!;
	expect(payment).toBeDefined();
	expect(payment.sender_address).toEqual(senderWalletAddress);
	expect(isValidPayment(order, senderClient.appId, payment)).toBeTruthy();
	expect(balanceBefore).toBe(await senderClient.wallet!.balance.update());

	console.log("OK.\n");
}

async function v1P2p() {
	console.log("===================================== P2P V1 =====================================");

	const offer = {
		id: "offer-id",
		amount: 2,
	};
	const appClient = new SampleAppClient(SMPL_APP_CONFIG.jwtAddress);
	const senderId = "test:rich_user:" + generateId();
	let jwt = await appClient.getV1RegisterJWT(senderId);

	const senderPrivateKey = SMPL_APP_CONFIG.keypair.secret();
	const senderWalletAddress = SMPL_APP_CONFIG.keypair.publicKey();
	const senderClient = await V1MarketplaceClient.create({ jwt }, senderPrivateKey);
	await senderClient.activate();

	const recipientId = "test:" + generateId();
	jwt = await appClient.getV1RegisterJWT(recipientId);
	const recipientClient = await V1MarketplaceClient.create({ jwt });
	await recipientClient.activate();

	jwt = await appClient.getV1P2PJWT({
		offer_id: offer.id,
		amount: offer.amount,
		sender_title: "sent moneys",
		sender_description: "money sent to test p2p",
		recipient_id: recipientId,
		recipient_title: "get moneys",
		recipient_description: "money received from p2p testing"
	});

	const openOrder = await senderClient.createExternalOrder(jwt);
	expect(openOrder.offer_type).toBe("spend");
	expect(openOrder.blockchain_data.sender_address).toEqual(senderWalletAddress);

	// pay for the offer
	const res = await senderClient.pay(openOrder.blockchain_data.recipient_address!, offer.amount, openOrder.id);
	console.log("pay result hash: " + res.hash);
	await senderClient.submitOrder(openOrder.id);

	// poll on order payment
	const order = await retry(() => senderClient.getOrder(openOrder.id), order => order.status === "completed", "order did not turn completed");
	console.log(`completion date: ${ order.completion_date }`);

	// find payment on blockchain
	const payment = (await retry(() => senderClient.findKinPayment(order.id), payment => !!payment, "failed to find payment on blockchain"))!;
	expect(payment).toBeDefined();
	expect(payment.sender_address).toEqual(senderWalletAddress);

	console.log("order.blockchain_data: ", order.blockchain_data);
	console.log(`payment on blockchain:`, payment);
	expect(isValidPayment(order, senderClient.appId, payment)).toBeTruthy();
	console.log(`got order after submit`, order);
	console.log(`order history`, (await senderClient.getOrders()).orders.slice(0, 2));

	expect(order.result!.type).toBe("payment_confirmation");
	const paymentJwt = (order.result! as JWTValue).jwt;
	const jwtPayload = jsonwebtoken.decode(paymentJwt, { complete: true }) as JWTContent<JWTBodyPaymentConfirmation, "payment_confirmation">;

	expect(jwtPayload.payload.offer_id).toBe(order.offer_id);
	expect(jwtPayload.payload.sender_user_id).toBe(senderId);
	expect(jwtPayload.payload.recipient_user_id).toBe(recipientId);
	expect(jwtPayload.header.kid).toBeDefined();
	expect(jwtPayload.payload.iss).toEqual("kin");
	expect(await appClient.isValidSignature(paymentJwt)).toBeTruthy();

	console.log("OK.\n");
}

async function userProfile() {
	console.log("===================================== userProfile =====================================");

	const userId = generateId();
	const deviceId = generateId();
	const appClient = new SampleAppClient(SMPL_APP_CONFIG.jwtAddress);

	const jwt = await appClient.getRegisterJWT(userId, deviceId);
	const client = await MarketplaceClient.create({ jwt });
	await client.updateWallet(SMPL_APP_CONFIG.keypair.secret());

	let profile = await client.getUserProfile();

	expect(profile.stats.earn_count).toEqual(0);
	expect(profile.stats.spend_count).toEqual(0);
	expect(profile.created_date).not.toBeUndefined();

	// start an order
	const selectedOffer = await getOffer(client, "earn", "tutorial");
	console.log(`requesting order for offer: ${ selectedOffer.id }: ${ selectedOffer.content.slice(0, 100) }`);
	const openOrder = await client.createOrder(selectedOffer.id);
	console.log(`got order ${ openOrder.id }`);

	profile = await client.getUserProfile();

	console.log("profile", profile);
	expect(profile.stats.earn_count).toEqual(1);
	expect(profile.stats.spend_count).toEqual(0);

	console.log("OK.\n");
}

async function v1UserProfile() {
	console.log("===================================== userProfile V1 =====================================");

	const userId = generateId();
	const appClient = new SampleAppClient(SMPL_APP_CONFIG.jwtAddress);

	const jwt = await appClient.getV1RegisterJWT(userId);
	const client = await V1MarketplaceClient.create({ jwt });

	let profile = await client.getUserProfile();

	expect(profile.stats.earn_count).toEqual(0);
	expect(profile.stats.spend_count).toEqual(0);
	expect(profile.created_date).toBeUndefined();

	// start an order
	const selectedOffer = await getOffer(client, "earn", "tutorial");
	console.log(`requesting order for offer: ${ selectedOffer.id }: ${ selectedOffer.content.slice(0, 100) }`);
	const openOrder = await client.createOrder(selectedOffer.id);
	console.log(`got order ${ openOrder.id }`);

	profile = await client.getUserProfile();

	console.log("profile", profile);
	expect(profile.stats.earn_count).toEqual(1);
	expect(profile.stats.spend_count).toEqual(0);

	console.log("OK.\n");
}

async function twoUsersSharingWallet() {
	console.log("===================================== twoUsersSharingWallet =====================================");

	const deviceId = generateId();
	const appClient = new SampleAppClient(SMPL_APP_CONFIG.jwtAddress);
	const offers = await appClient.getOffers();
	const earnOffers = offers.filter((item: any) => item.type === "earn");
	const walletKeys = Keypair.random();
	console.log(`public key: ${ walletKeys.publicKey() }`);
	console.log(`private key: ${ walletKeys.secret() }`);

	const userId1 = "test:" + generateId();
	console.log(`creating user ${ userId1 }`);
	const client1 = await MarketplaceClient.create({ jwt: await appClient.getRegisterJWT(userId1, deviceId) });
	await client1.updateWallet(walletKeys.publicKey());
	await client1.activate();

	let orderCount = randomInteger(1, earnOffers.length);
	for (let i = 0; i < orderCount; i++) {
		const offer = earnOffers[i];
		console.log(`ordering earn offer ${ offer.id } of ${ offer.amount } kin for user ${ userId1 }`);
		const offerJwt = await appClient.getEarnJWT(userId1, deviceId, offer.id);
		const openOrder = await client1.createExternalOrder(offerJwt);
		await client1.submitOrder(openOrder.id);
		await retry(() => client1.getOrder(openOrder.id), order => order.status === "completed", "order did not turn completed");
	}

	const userId2 = "test:" + generateId();
	console.log(`creating user ${ userId2 }`);
	const client2 = await MarketplaceClient.create({ jwt: await appClient.getRegisterJWT(userId2, deviceId) });
	await client2.updateWallet(walletKeys.secret());
	await client2.activate();

	let wallet1Balance = await client1.wallet!.balance.update();
	let wallet2Balance = await client2.wallet!.balance.update();

	expect(wallet1Balance).toBe(wallet2Balance);

	const spendOffers = offers.filter((item: any) => item.type === "spend");
	orderCount = randomInteger(0, spendOffers.length);

	for (let i = 0; i < orderCount; i++) {
		const offer = spendOffers[i];
		if (client2.wallet!.balance.cached - offer.amount <= 0) {
			continue;
		}

		console.log(`ordering earn offer ${ offer.id } of ${ offer.amount } kin for user ${ userId2 }`);
		const offerJwt = await appClient.getSpendJWT(userId1, deviceId, offer.id);
		const openOrder = await client1.createExternalOrder(offerJwt);
		await client1.submitOrder(openOrder.id);
		await retry(() => client1.getOrder(openOrder.id), order => order.status === "completed", "order did not turn completed");
		await client2.wallet!.balance.update();
	}
	await client1.wallet!.balance.update();

	wallet1Balance = await client1.wallet!.balance.update();
	wallet2Balance = await client2.wallet!.balance.update();

	expect(wallet1Balance).toBe(wallet2Balance);

	const orders1 = (await client1.getOrders()).orders.map(o => o.id);
	const orders2 = (await client2.getOrders()).orders.map(o => o.id);
	expect(orders1.length).toBe(orders2.length);
	orders1.every(id => {
		expect(orders2.includes(id));
		return true;
	});

	console.log("OK.\n");
}

async function walletSharedAcrossApps() {
	console.log("===================================== walletSharedAcrossApps =====================================");

	// app 1
	{
		const deviceId = generateId();
		const appClient = new SampleAppClient(SMPL_APP_CONFIG.jwtAddress);
	}

	// app 2
	{

	}

	console.log("OK.\n");
}

async function checkValidTokenAfterLoginRightAfterLogout() {
	console.log("===================================== checkValidTokenAfterLoginRightAfterLogout =====================================");

	const userId = generateId();
	const deviceId = generateId();
	const appClient = new SampleAppClient(SMPL_APP_CONFIG.jwtAddress);
	let jwt = await appClient.getRegisterJWT(userId, deviceId);
	const client = await MarketplaceClient.create({ jwt });
	await client.updateWallet(SMPL_APP_CONFIG.keypair.publicKey());
	await client.activate();

	await client.getOffers();

	jwt = await appClient.getRegisterJWT(userId, deviceId);
	// do not wait for it! otherwise there's no race condition
	client.logout();

	await client.login({ jwt });
	const offers = await client.getOffers();
	expect(offers.offers.length).toBeGreaterThan(0);

	console.log("OK.\n");
}

async function checkClientMigration() {
	console.log("===================================== checkClientMigration =====================================");

	const userId = generateId();
	const deviceId = generateId();
	const appClient = new SampleAppClient(SMPL_APP_CONFIG.jwtAddress);
	const jwt = await appClient.getRegisterJWT(userId, deviceId);
	const client = await MarketplaceClient.create({ jwt });

	await axios.put(`${ process.env.MARKETPLACE_BASE }/v2/applications/${ client.appId }/blockchain_version`, {
		blockchain_version: "2"
	});

	const keypair = Keypair.random();
	await client.updateWallet(keypair.secret());

	const selectedOfferV2 = await getOffer(client, "earn", "tutorial");

	console.log(`requesting order for offer: ${ selectedOfferV2.id }: ${ selectedOfferV2.content.slice(0, 100) }`);
	const openOrderV2 = await client.createOrder(selectedOfferV2.id);
	console.log(`got order ${ openOrderV2.id }`);

	const content = JSON.stringify({});

	await client.submitOrder(openOrderV2.id, { content });
	const orderV2 = await retry(() => client.getOrder(openOrderV2.id), order => order.status === "completed", "order did not turn completed");

	console.log(`completion date: ${ orderV2.completion_date }`);
	console.log(`got order after submit`, orderV2);

	await client.changeAppBlockchainVersion("3");
	await delay(100);

	// shouldMigrate API
	const shouldMigrate = await client.shouldMigrate(keypair.publicKey());
	console.log("shouldMigrate", shouldMigrate);
	expect(shouldMigrate.should_migrate).toBe(true);

	// burning wallet
	const burnStatus = await client.burnWallet();
	console.log("burnStatus", burnStatus);
	expect(burnStatus).toBe(true);

	// migrating a wallet
	const migrationResponse = await client.migrate();
	console.log("migrationResponse", migrationResponse);
	expect(migrationResponse).toBe(true);

	await client.updateWallet(keypair.secret()); // needed to reset kinjs version
	const selectedOfferV3 = await getOffer(client, "spend");
	console.log(`requesting order for offer: ${ selectedOfferV3.id }: ${ selectedOfferV3.content }`);
	const openOrderV3 = await client.createOrder(selectedOfferV3.id);
	console.log(`got open order`, openOrderV3);

	// pay for the offer
	const transaction = await client.getTransactionXdr(openOrderV3.blockchain_data.recipient_address!, selectedOfferV3.amount, openOrderV3.id);
	console.log("transaction XDR: " + transaction);
	await client.submitOrder(openOrderV3.id, { transaction });

	// poll on order payment
	const orderV3 = await retry(() => client.getOrder(openOrderV3.id), order => order.status === "completed", "order did not turn completed");
	console.log(`completion date: ${ orderV3.completion_date }`);
	console.log(`got order after submit`, orderV3);
	console.log(`order history`, (await client.getOrders()).orders.slice(0, 2));

	JSON.parse(orderV3.content!);

	// set app_id blockchain_version back to 2
	await client.changeAppBlockchainVersion("2");
}

async function checkTransferKin(){
	console.log("===================================== checkTransferKin =====================================");

	const userId = generateId();
	const deviceId = generateId();
	const appClient = new SampleAppClient(SMPL_APP_CONFIG.jwtAddress);
	let jwt = await appClient.getRegisterJWT(userId, deviceId);
	const client = await MarketplaceClient.create({ jwt });
	await client.updateWallet(SMPL_APP_CONFIG.keypair.publicKey());

	const receiverWalletAddress = `wallet-${ generateId() }`;
	const order = await client.createCrossAppOrder(receiverWalletAddress,'sender-app','mock client title','mock client description',1000);
	expect(order).toMatchObject({amount: 1000})

}

async function main() {
	async function v1() {
		await v1RegisterJWT();
		await v1OutdatedJWT();
		await v1UpdateWallet();
		await v1UserProfile();
		await v1ExtraTrustlineIsOK();
		await v1EarnPollFlow();
		await v1EarnTutorial();
		await v1SpendFlow();
		await v1EarnQuizFlow();
		await v1NativeEarnFlow();
		await v1NativeSpendFlow();
		await v1DidNotApproveTOS();
		await v1TestRegisterNewUser();
		await v1TryToNativeSpendTwice();
		await v1TryToNativeSpendTwiceWithNonce();
		await v1P2p();
	}

	async function v2() {
		await registerJWT();
		await outdatedJWT();
		await updateWallet();
		await userProfile();
		await extraTrustlineIsOK();
		await earnPollFlow();
		await earnTutorial();
		await spendFlow();
		await earnQuizFlow();
		await nativeEarnFlow();
		await nativeSpendFlow();
		await didNotApproveTOS();
		await testRegisterNewUser();
		await tryToNativeSpendTwice();
		await tryToNativeSpendTwiceWithNonce();
		await p2p();
		await getOfferTranslations();
		await twoUsersSharingWallet();
		await checkValidTokenAfterLoginRightAfterLogout();
		await getOffersVersionSpecificImages();
		await checkTransferKin();
	}

	async function migration() {
		await kin3EarnPollFlow();
		await kin3EarnTutorial();
		await kin3SpendFlow();
		await kin3EarnQuizFlow();
		await checkClientMigration();
		await walletSharedAcrossApps();
	}

	await v1();
	await v2();
	await migration();
}

main()
	.then(() => console.log("done"))
	.catch(err => {
		console.log(err.message + "\n" + err.stack);
		process.exitCode = 1;
	});
