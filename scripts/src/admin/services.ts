import { Request, RequestHandler, Response } from "express";

import { Application, ApplicationConfig, AppOffer } from "../models/applications";
import { Cap, Offer, OfferContent, PollAnswer } from "../models/offers";
import { GradualMigrationUser, User, WalletApplication } from "../models/users";
import { OpenOrderStatus, Order, OrderContext } from "../models/orders";
import { IdPrefix, isNothing } from "../utils/utils";
import * as payment from "../public/services/payment";
import { BlockchainConfig, getBlockchainConfig } from "../public/services/payment";
import { getOffers as getUserOffersService } from "../public/services/offers";

let BLOCKCHAIN: BlockchainConfig;
let BLOCKCHAIN3: BlockchainConfig;
getBlockchainConfig("2").then(data => BLOCKCHAIN = data);
getBlockchainConfig("3").then(data => BLOCKCHAIN3 = data);

const OFFER_HEADERS = `<tr>
<th>ID</th>
<th>orders</th>
<th>polls</th>
<th>name</th>
<th>type</th>
<th>amount</th>
<th>title</th>
<th>description</th>
<th>image</th>
<th>total cap</th>
<th>total per user</th>
<th>address</th>
<th>owner</th>
<th>date</th>
</tr>`;

const ORDER_HEADERS = `<tr>
<th>id</th>
<th>status</th>
<th>error</th>
<th>origin</th>
<th>type</th>
<th>userId</th>
<th>amount</th>
<th>title</th>
<th>description</th>
<th>content</th>
<th>offerId</a></th>
<th>transaction_id</th>
<th>userWallet</th>
<th>date</th>
<th>payment confirmation</th>
</tr>`;

async function appToHtml(app: Application): Promise<string> {
	return `
<tr>
	<td>${ app.id }</td>
	<td>${ app.name }</td>
	<td>${ app.apiKey }</td>
	<td><a href="/applications/${ app.id }/users">users</a></td>
	<td><a href="/applications/${ app.id }/offers">offers</a></td>
	<td>
		<a href="${ BLOCKCHAIN.horizon_url }/accounts/${ app.walletAddresses.sender }">earn wallet KIN2</a>
		<a href="${ BLOCKCHAIN3.horizon_url }/accounts/${ app.walletAddresses.sender }">earn wallet KIN3</a>
	</td>
	<td>
		<a href="${ BLOCKCHAIN.horizon_url }/accounts/${ app.walletAddresses.recipient }">spend wallet KIN2</a>
		<a href="${ BLOCKCHAIN3.horizon_url }/accounts/${ app.walletAddresses.recipient }">spend wallet KIN3</a>
		</td>
	<td><pre>${ JSON.stringify(app.jwtPublicKeys, null, 2) }</pre></td>
	<td onclick="openEditor(this, '${ app.id }')"><pre>${ JSON.stringify(app.config, null, 2) }</pre></td>
</tr>`;
}

async function offerToHtml(offer: Offer, appOffer?: AppOffer): Promise<string> {
	function total() {
		if (appOffer) {
			return `<input type="text" onchange="submitData('/applications/${ appOffer.appId }/offers/${ offer.id }', { cap: { total: parseInt(this.value, 10) } })" value="${ appOffer.cap.total }"/>`;
		}
		return ``;
	}

	function perUser() {
		if (appOffer) {
			return `<input type="text" onchange="submitData('/applications/${ appOffer.appId }/offers/${ offer.id }', { cap: { per_user: parseInt(this.value, 10) } })" value="${ appOffer.cap.per_user }"/>`;
		}
		return ``;
	}

	function address() {
		if (appOffer) {
			return `<a href="${ BLOCKCHAIN.horizon_url }/accounts/${ appOffer.walletAddress }">${ appOffer.walletAddress }</a>`;
		}
		return ``;
	}

	function getAmountElement() {
		return `<input type="number" onchange="submitData('/offers/${ offer.id }', { amount: Number(this.value) })" value="${ offer.amount }"/>`;
	}

	const offerContent = ((await OfferContent.get(offer.id)) || { contentType: "poll", content: "{}" });
	const offerIdHtml = offerContent.contentType === "coupon" ? offer.id : `<a onclick="overlayOn(this.dataset.content, '${ offer.id }')" data-content="${ escape(offerContent.content) }">${ offer.id }</a>`;
	return `<tr class='offer-row'>
<td class='offer-id'>${ offerIdHtml }</td>
<td><a href="/orders?offer_id=${ offer.id }">orders</a></td>
<td><a href="/polls/${ offer.id }">polls</a></td>
<td>${ offer.name }</td>
<td>${ offer.type }</td>
<td>${ getAmountElement() }</td>
<td>${ offer.meta.title }</td>
<td>${ offer.meta.description }</td>
<td><img src="${ offer.meta.image }"/></td>
<td>${ total() }</td>
<td>${ perUser() }</td>
<td>${ address() }</td>
<td>${ offer.ownerId }</td>
<td>${ offer.createdDate.toISOString() }</td>
</tr>`;
}

async function orderToHtml(order: Order): Promise<string> {
	const defaultContext = {
		meta: { title: "", description: "", content: "" },
		type: "",
		userId: ""
	};

	const contexts = order.contexts || [defaultContext];
	const transactionId = order.blockchainData ? order.blockchainData.transaction_id : null;
	const payJwt = order.value && order.value.type === "payment_confirmation" ? order.value.jwt : null;
	let html = "";

	for (const context of contexts) {
		let userWallet = null;
		if (order.blockchainData) {
			userWallet = context.type === "earn" ?
				order.blockchainData.recipient_address :
				order.blockchainData.sender_address;
		}
		const blockchain = (await WalletApplication.getBlockchainVersion(userWallet!)) === "3" ? BLOCKCHAIN3 : BLOCKCHAIN;

		html += `<tr>
<td><a href="/orders/${ order.id }">${ order.id }</a></td>
<td class="status_${ order.status }"><a href="/orders?status=${ order.status }">${ order.status }</a></td>
<td><pre>${ JSON.stringify(order.error) }</pre></td>
<td>${ order.origin }</td>
<td>${ order.flowType() }: ${ context.type }</td>
<td><a href="/users/${ context.userId }">${ context.userId }</a></td>
<td>${ order.amount }</td>
<td>${ context.meta.title }</td>
<td>${ context.meta.description }</td>
<td><pre>${ context.meta.content }</pre></td>
<td><a href="/offers/${ order.offerId }">${ order.offerId }</a></td>
<td><a href="${ blockchain.horizon_url }/transactions/${ transactionId }">${ transactionId }</a></td>
<td><a href="${ blockchain.horizon_url }/accounts/${ userWallet }">${ userWallet }</a></td>
<td>${ (order.currentStatusDate || order.createdDate).toISOString() }</td>
<td><pre><a href="https://jwt.io?token=${ payJwt }">${ payJwt }</a></pre></td>
</tr>`;
	}

	return html;
}

async function userToHtml(user: User): Promise<string> {
	const wallets = (await user.getWallets()).all();

	const onKin3 = (await WalletApplication.findByIds(wallets.map(w => w.address))).reduce((obj, w) => {
		obj[w.walletAddress] = !!w.createdDateKin3;
		return obj;
	}, {} as { [key: string]: boolean });

	const accounts = wallets
		.sort((w1, w2) => w1.lastUsedDate.valueOf() - w2.lastUsedDate.valueOf())
		.map(wallet => {
			const blockchainVersion = onKin3[wallet.address] ? "3" : "2";
			const blockchain = blockchainVersion === "3" ? BLOCKCHAIN3 : BLOCKCHAIN;
			return `
		<span class="kin${ blockchainVersion }-wallet">KIN${ blockchainVersion } device: ${ wallet.deviceId }
		<a href="${ blockchain.horizon_url }/accounts/${ wallet.address }">${ wallet.address }</a>
		<a href="/wallets/${ wallet.address }">balance</a>
		<a href="/wallets/${ wallet.address }/payments">kin transactions</a></span>`;
		}).join("<br/>");

	const inMigrationList = !!(await GradualMigrationUser.findOneById(user.id));
	return `
<ul>
	<li>ecosystem id: <a href="/users/${ user.id }">${ user.id }</a></li>
	<li>appId: ${ user.appId }</li>
	<li>appUserId: ${ user.appUserId }</li>
	<li>Migration: ${ inMigrationList ? "In List" : "NOT in list" } <a class="add-migration-user" onclick="submitData('/migration/users', { user_id: '${ user.id }'})">add to gradual migration list</a></li>
	<li>wallets:<br/>${ accounts }</li>
	<li>created: ${ user.createdDate }</li>
	<li><a href="/orders?user_id=${ user.id }">orders</a></li>
	<li><a href="/users/${ user.id }/offers">offers</a></li>
	<li><a href="https://analytics.amplitude.com/kinecosystem/project/204515/search/${ user.id }">client events</a></li>
</ul>`;
}

export type Paging = { limit: number, page: number };
const DEFAULT_PAGE = 0;
const DEFAULT_LIMIT = 150;

function skip(query: Paging): number {
	return (query.page || 0) * take(query);
}

function take(query: Paging): number {
	return (query.limit || DEFAULT_LIMIT);
}

export async function getApplications(params: any, query: Paging): Promise<string> {
	const apps = await Application.find({ order: { createdDate: "DESC" }, take: take(query), skip: skip(query) });
	let ret = "<table>";
	for (const app of apps) {
		ret += await appToHtml(app);
	}
	ret += "</table>";
	return ret;
}

export async function getApplication(params: { app_id: string }, query: any): Promise<string> {
	const app = await Application.get(params.app_id);
	if (!app) {
		throw new Error("no such app: " + params.app_id);
	}
	return `<table>${ await appToHtml(app) }</table>`;
}

export async function getApplicationUsers(params: { app_id: string }, query: Paging): Promise<string> {
	const users: User[] = await User.find({
		where: { appId: params.app_id },
		order: { createdDate: "DESC" },
		take: take(query),
		skip: skip(query)
	});
	let ret = "";
	for (const user of users) {
		ret += await userToHtml(user);
	}
	return ret;
}

export async function getOffers(params: any, query: Paging): Promise<string> {
	const offers = await Offer.find({ order: { createdDate: "DESC" }, take: take(query), skip: skip(query) });
	let ret = `<table>${ OFFER_HEADERS }`;
	for (const offer of offers) {
		ret += await offerToHtml(offer);
	}
	ret += "</table>";
	return ret;
}

export async function getApplicationOffers(params: { app_id: string }, query: Paging): Promise<string> {
	const app = await Application.createQueryBuilder("app")
		.where("app.id = :appId", { appId: params.app_id })
		.leftJoinAndSelect("app.appOffers", "app_offer")
		.leftJoinAndSelect("app_offer.offer", "offer")
		.addOrderBy("offer.createdDate", "ASC")
		.limit(take(query))
		.offset(skip(query))
		.getOne();

	if (!app) {
		throw new Error("no such app: " + params.app_id);
	}

	console.log(`length ${ app.appOffers.length }`);
	let ret = `<table>${ OFFER_HEADERS }`;
	for (const appOffer of app.appOffers) {
		console.log(`offer: `, appOffer.offer);
		ret += await offerToHtml(appOffer.offer, appOffer);
	}
	ret += "</table>";
	return ret;
}

export async function getOffer(params: { offer_id: string }, query: any): Promise<string> {
	const offer = await Offer.get(params.offer_id);
	if (!offer) {
		throw new Error("no such offer: " + params.offer_id);
	}
	return `<table>${ OFFER_HEADERS }${ await offerToHtml(offer) }</table>`;
}

export async function getUserOffers(params: { user_id: string }, query: any): Promise<string> {
	const user = await User.findOneById(params.user_id);
	if (!user) {
		throw new Error("user not found: " + params.user_id);
	}

	const offers = (await getUserOffersService(user.id, user.appId, {})).offers;
	let ret = `<table>${ OFFER_HEADERS }`;
	for (const offer of offers) {
		const appOffer = (await AppOffer.findOne({ offerId: offer.id, appId: user.appId }))!;
		ret += await offerToHtml(appOffer.offer, appOffer);
	}
	ret += "</table>";
	return ret;
}

export async function getUserData(params: { user_id: string }, query: any): Promise<string> {
	const user = await User.findOneById(params.user_id);
	if (!user) {
		throw new Error("user not found: " + params.user_id);
	}
	return await userToHtml(user);
}

export async function getApplicationUserData(params: { app_user_id: string, app_id: string }, query: any): Promise<string> {
	const user = await User.findOne({ appUserId: params.app_user_id, appId: params.app_id });
	if (!user) {
		throw new Error("user not found: " + params.app_user_id);
	}
	return await userToHtml(user);
}

export async function getOrders(params: any, query: Paging & { status?: OpenOrderStatus, user_id?: string, offer_id?: string }): Promise<string> {
	const q = Order.genericGet({ offerId: query.offer_id, status: query.status });

	if (query.user_id) {
		const userOrders = await Order.genericGet({ userId: query.user_id }).getMany();
		let orderIds = userOrders.map(o => o.id);
		if (!orderIds.length) {
			orderIds = ["no_orders"];
		}
		q.where(`ordr.id IN (:ids)`, { ids: orderIds });

	}

	const orders = await q.skip(skip(query)).take(take(query)).getMany();

	let ret = `<table>${ ORDER_HEADERS }`;
	for (const order of orders) {
		ret += await orderToHtml(order);
	}
	ret += "</table>";
	return ret;
}

export async function retryOrder(params: { order_id: string }, query: any): Promise<string> {
	const order = await Order.getOne({ orderId: params.order_id });

	if (!order) {
		throw new Error("order not found: " + params.order_id);
	}
	if (order.status !== "failed" || order.isP2P() || order.contexts[0].type !== "earn") {
		throw new Error("cant retry non earn or non failed orders");
	}
	order.setStatus("pending");
	await order.save();
	await payment.payTo(order.blockchainData.recipient_address!, order.contexts[0].user.appId, order.amount, order.id);

	return `<h3>Retrying...</h3>
<div><a href="/orders/${ order.id }">Go Back</a>
<script>
window.setTimeout(function(){
        // Move to a new location or you can do something else
        window.location.href = "/orders/${ order.id }";
    }, 5000);
</script>
</div>`;
}

export async function retryUserWallet(params: { user_id: string; wallet: string; }, query: any): Promise<string> {
	const user = await User.findOneById(params.user_id);
	if (!user) {
		throw new Error("user not found: " + params.user_id);
	}
	await payment.createWallet(params.wallet, user.appId, user.id, "2");
	return `<h3>Retrying...</h3>
<div><a href="/users/${ user.id }">Go Back</a>
<script>
	window.setTimeout(function(){
		// Move to a new location or you can do something else
		window.location.replace("/users/${ user.id }");
	}, 5000);
</script>
</div>`;
}

export async function addMigrationUser(body: { user_id: string }, params: any, query: any): Promise<any> {
	await GradualMigrationUser.create({ userId: body.user_id }).save();
	return { msg: "OK" };
}

export async function getOrder(params: { order_id: string }, query: any): Promise<string> {
	const orders = await Order.queryBuilder("order")
		.where("LOWER(order.id) = LOWER(:orderId)", { orderId: params.order_id })
		.getMany();
	if (orders.length === 0) {
		throw new Error("order not found: " + params.order_id);
	}
	let ret = `<table>${ ORDER_HEADERS }`;
	for (const order of orders) {
		order.contexts = await OrderContext.find({ orderId: order.id });
		ret += await orderToHtml(order);
	}
	ret += "</table>";
	return ret;
}

export async function getPollResults(params: { offer_id: string }, query: any): Promise<string> {
	const answers = await PollAnswer.find({
		where: { offerId: params.offer_id },
		order: { createdDate: "DESC" }, take: take(query), skip: skip(query)
	});
	let ret = `<table>`;
	for (const answer of answers) {
		ret += `<tr><td><pre class="wide">${ answer.content }</pre></td></tr>`;
	}
	ret += "</table>";
	return ret;
}

export async function fuzzySearch(params: { some_id: string }, query: any): Promise<string> {
	switch (params.some_id[0]) {
		case IdPrefix.App:
			return getApplication({ app_id: params.some_id }, query);
		case IdPrefix.Offer:
			return getOffer({ offer_id: params.some_id }, query);
		case IdPrefix.Transaction:
			return getOrder({ order_id: params.some_id }, query);
		case IdPrefix.User:
			return getUserData({ user_id: params.some_id }, query);
		default:
			return "unknown";
	}
}

export async function getWallet(params: { wallet_address: string }, query: any): Promise<string> {
	const data = await payment.getWalletData(params.wallet_address, { timeout: 5000 });
	let ret = `<pre class="wide">${ JSON.stringify(data, null, 2) }</pre>`;

	if (data.kin_balance === null) {
		ret = `<h3 class="alert">Untrusted!</h3>` + ret;
	}
	return ret;
}

export async function getWalletPayments(params: { wallet_address: string }, query: any): Promise<string> {
	const data = await payment.getPayments(params.wallet_address, { timeout: 5000 });
	return `<pre class="wide">${ JSON.stringify(data, null, 2) }</pre>`;
}

export async function changeAppOffer(body: { cap: Cap }, params: { app_id: string, offer_id: string }, query: any): Promise<any> {
	const appOffer = await AppOffer.findOne({ offerId: params.offer_id, appId: params.app_id });
	if (!appOffer) {
		throw new Error("no such offer: " + params.offer_id);
	}

	let didChange = false;
	if (body && body.cap) {
		const total = body.cap.total;
		if (!isNothing(total) && total >= 0) {
			appOffer.cap.total = total;
			didChange = true;
		}
		const per_user = body.cap.per_user;
		if (!isNothing(per_user) && per_user >= 0) {
			appOffer.cap.per_user = per_user;
			didChange = true;
		}
	}

	if (!didChange) {
		throw new Error("cap must be defined, a number and greater or equal to 0 - received: " + JSON.stringify(body));
	}

	await appOffer.save();
	return { appOffer };
}

export type ChangeOfferData = Partial<Offer> & {
	content: string;
};

function isInOffer(key: string, offer: Offer): key is keyof Offer {
	return key in offer;
}

export async function changeOffer(body: ChangeOfferData, params: { offer_id: string }, query: any): Promise<any> {
	const offer = await Offer.findOneById(params.offer_id);
	console.log("changeOffer:", offer, "with:", body);
	if (!offer) {
		throw new Error("no such offer: " + params.offer_id);
	}
	if (!Object.keys(body)) {
		throw new Error("invalid input: empty");
	}
	Object.keys(body).forEach(async key => {
		if (key === "content") {
			const offerContent = (await OfferContent.findOne({ offerId: params.offer_id }))!;
			offerContent.content = body.content;
			await offerContent.save();
		}
		if (isInOffer(key, offer)) {
			offer[key] = body[key]!;
			console.log("updating:", key, "with:", body[key]);
		}
	});

	await offer.save();
}

type AppConfig = ApplicationConfig & { [limits: string]: number };
type UpdateAppConfigRequest = Request & { body: AppConfig; };

export const updateAppConfig = async function(req: UpdateAppConfigRequest, res: Response) {
	const config: AppConfig = req.body;
	const isLimitsNumbers = (configObj: AppConfig, limitName: string) => typeof configObj.limits[limitName as keyof AppConfig["limits"]] === "number";
	if (!config.limits || !Object.keys(config.limits).every(isLimitsNumbers.bind(null, config))) {
		res.status(400).send("Config data is invalid");
		return false;
	}

	const app = (await Application.findOne({ id: req.params.application_id }))!;
	try {
		app.config = config;
		await app.save();
	} catch (e) {
		res.status(500).send(e.message);
	}
	res.status(204).send();
} as any as RequestHandler;
