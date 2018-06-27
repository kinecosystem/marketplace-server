import { Application } from "../models/applications";
import { Offer, PollAnswer } from "../models/offers";
import { getManager } from "typeorm";
import { User } from "../models/users";
import { OpenOrderStatus, Order } from "../models/orders";
import { IdPrefix } from "../utils";
import { BlockchainConfig, getBlockchainConfig } from "../public/services/payment";
import { getDefaultLogger } from "../logging";
import { getOffers as getUserOffersService } from "../public/services/offers";
import * as payment from "../public/services/payment";

type Stats = {
	id: string
	name: string,
	type: string,
	total_cap: number,
	orders: number,
	failed_orders: number,
	assets_owned: number,
	assets_left: number,
	orders_missing_asset: number
};

let BLOCKCHAIN: BlockchainConfig;
getBlockchainConfig(getDefaultLogger()).then(data => BLOCKCHAIN = data);

const OFFER_HEADERS = `<tr>
<th>ID</th>
<th>stats</th>
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
<th>owner</th>
<th>recipient</th>
<th>sender</th>
<th>date</th>
</tr>`;

const STATS_HEADERS = `<tr>
<th>ID</th>
<th>name</th>
<th>type</th>
<th>total cap</th>
<th>completed/pending orders</th>
<th>failed orders</th>
<th>assets owned</th>
<th>assets left</th>
<th>orders missing asset</th>
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
<th>date</th>
<th>payment confirmation</th>
</tr>`;

function getStatsQuery(offerId: string | "all") {
	return `
	 select
  a.id,
  a.name,
  a.type,
  a.cap::json->'total' as total_cap,
  coalesce(ordered.num,0) as orders,
  coalesce(failed_orders.num, 0) as failed_orders,
  coalesce(owned.num,0) as assets_owned,
  coalesce(unowned.num,0) as assets_left,
  CASE WHEN a.type = 'spend' THEN
    coalesce(ordered.num,0) - coalesce(owned.num,0) ELSE
    NULL END
  as orders_missing_asset
from offers a
left join (select offer_id, count(*) as num from orders where status = 'completed' or ((status = 'pending' or status='opened') and expiration_date > now()) group by offer_id) as ordered
on ordered.offer_id = a.id
left join (select offer_id, count(*) as num from orders where status = 'failed' or (status = 'pending' and expiration_date < now()) group by offer_id) as failed_orders
on failed_orders.offer_id = a.id
left join (select offer_id, count(*) as num from assets where owner_id is null group by offer_id) unowned
on unowned.offer_id = a.id
left join (select offer_id, count(*) as num from assets where owner_id is not null group by offer_id) owned
on owned.offer_id = a.id
where a.id = '${offerId}' or '${offerId}' = 'all'
order by type desc, abs(ordered.num - owned.num) desc, ordered.num desc`;
}

function statsToHtml(stats: Stats) {
	return `<tr>
<td>${stats.id}</td>
<td>${stats.name}</td>
<td>${stats.type}</td>
<td>${stats.total_cap}</td>
<td>${stats.orders}</td>
<td>${stats.failed_orders}</td>
<td>${stats.assets_owned}</td>
<td>${stats.assets_left}</td>
<td>${stats.orders_missing_asset}</td>
</tr>`;
}

async function appToHtml(app: Application): Promise<string> {
	return `<tr>
<td>${app.id}</td>
<td>${app.name}</td>
<td>${app.apiKey}</td>
<td><a href="/applications/${app.id}/users">users</a></td>
<td><a href="/applications/${app.id}/offers">offers</a></td>
<td><a href="${BLOCKCHAIN.horizon_url}/accounts/${app.walletAddresses.sender}">sender wallet (earn)</a></td>
<td><a href="${BLOCKCHAIN.horizon_url}/accounts/${app.walletAddresses.recipient}">recipient wallet (spend)</a></td>
<td><pre class="wide">${JSON.stringify(app.jwtPublicKeys, null, 2)}</pre></td>
</tr>`;
}

async function offerToHtml(offer: Offer): Promise<string> {
	return `<tr>
<td>${offer.id}</td>
<td><a href="/offers/${offer.id}/stats">stats</a></td>
<td><a href="/orders?offer_id=${offer.id}">orders</a></td>
<td><a href="/polls/${offer.id}">polls</a></td>
<td>${offer.name}</td>
<td>${offer.type}</td>
<td>${offer.amount}</td>
<td>${offer.meta.title}</td>
<td>${offer.meta.description}</td>
<td><img src="${offer.meta.image}"/></td>
<td>${offer.cap.total}</td>
<td>${offer.cap.per_user}</td>
<td>${offer.ownerId}</td>
<td><a href="${BLOCKCHAIN.horizon_url}/accounts/${offer.blockchainData.recipient_address}">${offer.blockchainData.recipient_address}</a></td>
<td><a href="${BLOCKCHAIN.horizon_url}/accounts/${offer.blockchainData.sender_address}">${offer.blockchainData.sender_address}</a></td>
<td>${offer.createdDate.toISOString()}</td>
</tr>`;
}

async function orderToHtml(order: Order): Promise<string> {
	const transactionId = order.blockchainData ? order.blockchainData.transaction_id : null;
	const payJwt = order.value && order.value.type === "payment_confirmation" ? order.value.jwt : null;
	return `<tr>
<td>${order.id}</td>
<td class="status_${order.status}"><a href="/orders?status=${order.status}">${order.status}</a></td>
<td><pre>${JSON.stringify(order.error)}</pre></td>
<td>${order.origin}</td>
<td>${order.type}</td>
<td><a href="/users/${order.userId}">${order.userId}</a></td>
<td>${order.amount}</td>
<td>${order.meta.title}</td>
<td>${order.meta.description}</td>
<td><pre>${order.meta.content}</pre></td>
<td><a href="/offers/${order.offerId}">${order.offerId}</a></td>
<td><a href="${BLOCKCHAIN.horizon_url}/operations/${transactionId}">${transactionId}</a></td>
<td>${(order.currentStatusDate || order.createdDate).toISOString()}</td>
<td><pre><a href="https://jwt.io?token=${payJwt}">${payJwt}</a></pre></td>
</tr>`;
}

async function userToHtml(user: User): Promise<string> {
	return `
<ul>
<li>ecosystem id: ${user.id}</li>
<li>appId: ${user.appId}</li>
<li>appUserId: ${user.appUserId}</li>
<li>stellar account:
<a href="${BLOCKCHAIN.horizon_url}/accounts/${user.walletAddress}">${user.walletAddress}</a>
<a href="/wallets/${user.walletAddress}">balance</a>
<a href="/wallets/${user.walletAddress}/payments">kin transactions</a>
</li>
<li>created: ${user.createdDate}</li>
<li>activated: ${user.activatedDate}</li>
<li><a href="/orders?user_id=${user.id}">orders</a></li>
</ul>`;
}

export type Paging = { limit: number, page: number };
const DEFAULT_PAGE = 0;
const DEFAULT_LIMIT = 100;

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
	const app = await Application.findOneById(params.app_id);
	if (!app) {
		throw new Error("no such app: " + params.app_id);
	}
	return `<table>${await appToHtml(app)}</table>`;
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
	let ret = `<table>${OFFER_HEADERS}`;
	for (const offer of offers) {
		ret += await offerToHtml(offer);
	}
	ret += "</table>";
	return ret;
}

export async function getApplicationOffers(params: { app_id: string }, query: Paging): Promise<string> {
	const app = await Application.createQueryBuilder("app")
		.where("app.id = :appId", { appId: params.app_id })
		.leftJoinAndSelect("app.offers", "offer")
		.addOrderBy("offer.created_date", "ASC")
		.limit(take(query))
		.offset(skip(query))
		.getOne();

	if (!app) {
		throw new Error("no such app: " + params.app_id);
	}

	const offers = app.offers;
	let ret = `<table>${OFFER_HEADERS}`;
	for (const offer of offers) {
		ret += await offerToHtml(offer);
	}
	ret += "</table>";
	return ret;
}

export async function getOffer(params: { offer_id: string }, query: any): Promise<string> {
	const offer = await Offer.findOneById(params.offer_id);
	if (!offer) {
		throw new Error("no such offer: " + params.offer_id);
	}
	return `<table>${OFFER_HEADERS}${await offerToHtml(offer)}</table>`;
}

export async function getOfferStats(params: { offer_id: string }, query: any): Promise<string> {
	const stats: Stats[] = await getManager().query(getStatsQuery(params.offer_id));
	let ret = `<table>${STATS_HEADERS}`;
	for (const stat of stats) {
		ret += statsToHtml(stat);
	}
	ret += "</table>";
	return ret;
}

export async function getAllOfferStats(params: any, query: any): Promise<string> {
	const stats: Stats[] = await getManager().query(getStatsQuery("all"));

	let ret = `<table>${STATS_HEADERS}`;
	for (const stat of stats) {
		ret += statsToHtml(stat);
	}
	ret += "</table>";
	return ret;
}

export async function getUserOffers(params: { user_id: string }, query: any): Promise<string> {
	const user: User | undefined = await User.findOneById(params.user_id);
	if (!user) {
		throw new Error("user not found: " + params.user_id);
	}
	const offers = (await getUserOffersService(user.id, user.appId, {}, getDefaultLogger())).offers;
	let ret = `<table>${OFFER_HEADERS}`;
	for (const offer of offers) {
		const dbOffer = (await Offer.findOneById(offer.id))!;
		ret += await offerToHtml(dbOffer);
	}
	ret += "</table>";
	return ret;
}

export async function getUserData(params: { user_id: string }, query: any): Promise<string> {
	const user: User | undefined = await User.findOneById(params.user_id);
	if (!user) {
		throw new Error("user not found: " + params.user_id);
	}
	return await userToHtml(user);
}

export async function getApplicationUserData(params: { user_id: string, app_id: string }, query: any): Promise<string> {
	const user: User | undefined = await User.findOne({ appUserId: params.user_id, appId: params.app_id });
	if (!user) {
		throw new Error("user not found: " + params.user_id);
	}
	return await userToHtml(user);
}

export async function getOrders(params: any, query: Paging & { status?: OpenOrderStatus, user_id?: string, offer_id?: string }): Promise<string> {
	const queryBy: { offerId?: string, userId?: string, status?: OpenOrderStatus } = {};
	if (query.offer_id) {
		queryBy.offerId = query.offer_id;
	}
	if (query.user_id) {
		queryBy.userId = query.user_id;
	}
	if (query.status) {
		queryBy.status = query.status;
	}
	const orders = await Order.find({
		where: queryBy,
		order: { currentStatusDate: "DESC" },
		take: take(query),
		skip: skip(query)
	});
	let ret = `<table>${ORDER_HEADERS}`;
	for (const order of orders) {
		ret += await orderToHtml(order);
	}
	ret += "</table>";
	return ret;
}

export async function getOrder(params: { order_id: string }, query: any): Promise<string> {
	const order: Order | undefined = await Order.findOneById(params.order_id);
	if (!order) {
		throw new Error("order not found: " + params.order_id);
	}
	return `<table>${ORDER_HEADERS}${await orderToHtml(order)}</table>`;
}

export async function getPollResults(params: { offer_id: string }, query: any): Promise<string> {
	const answers: PollAnswer[] = await PollAnswer.find({
		where: { offerId: params.offer_id },
		order: { createdDate: "DESC" }, take: take(query), skip: skip(query)
	});
	let ret = `<table>`;
	for (const answer of answers) {
		ret += `<tr><td><pre class="wide">${answer.content}</pre></td></tr>`;
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
	const data = await payment.getWalletData(params.wallet_address, getDefaultLogger());
	let ret = `<pre class="wide">${JSON.stringify(data, null, 2)}</pre>`;

	if (data.kin_balance === null) {
		ret = `<h3 class="alert">Untrusted!</h3>` + ret;
	}
	return ret;
}

export async function getWalletPayments(params: { wallet_address: string }, query: any): Promise<string> {
	const data = await payment.getPayments(params.wallet_address, getDefaultLogger());
	return `<pre class="wide">${JSON.stringify(data, null, 2)}</pre>`;
}
