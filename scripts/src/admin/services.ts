import { Application } from "../models/applications";
import { Offer, PollAnswer } from "../models/offers";
import { getManager } from "typeorm";
import { User } from "../models/users";
import { Order } from "../models/orders";
import { IdPrefix } from "../utils";
import { BlockchainConfig, getBlockchainConfig } from "../public/services/payment";
import { getDefaultLogger } from "../logging";
import { GetOrderFilters } from "../../bin/models/orders";

let BLOCKCHAIN: BlockchainConfig;
getBlockchainConfig(getDefaultLogger()).then(data => BLOCKCHAIN = data);

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

const OFFER_HEADERS = `<tr>
<th>ID</th>
<th>stats</th>
<th>orders</th>
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

function appToHtml(app: Application): string {
	return `<tr>
<td>${app.id}</td>
<td>${app.name}</td>
<td>${app.apiKey}</td>
<td><a href="/applications/${app.id}/users">users</a></td>
<td><pre>${JSON.stringify(app.jwtPublicKeys, null, 2)}</pre></td>
</tr>`;
}

function offerToHtml(offer: Offer): string {
	return `<tr>
<td>${offer.id}</td>
<td><a href="/offers/${offer.id}/stats">stats</a></td>
<td><a href="/orders?offer_id=${offer.id}">orders</a></td>
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
</tr>`;
}

function orderToHtml(order: Order): string {
	return `<tr>
<td>${order.id}</td>
<td class="status_${order.status}"><a href="/orders?status=${order.status}">${order.status}</a></td>
<td>${order.error}</td>
<td>${order.origin}</td>
<td>${order.type}</td>
<td><a href="/users/${order.userId}">${order.userId}</a></td>
<td>${order.amount}</td>
<td>${order.meta.title}</td>
<td>${order.meta.description}</td>
<td><pre>${order.meta.content}</pre></td>
<td><a href="/offers/${order.offerId}">${order.offerId}</a></td>
<td><a href="${BLOCKCHAIN.horizon_url}/operations/${order.blockchainData.transaction_id}">${order.blockchainData.transaction_id}</a></td>
</tr>`;
}

function userToHtml(user: User): string {
	return `
<ul>
<li>ecosystem id: ${user.id}</li>
<li>appId: ${user.appId}</li>
<li>appUserId: ${user.appUserId}</li>
<li>wallet: <a href="${BLOCKCHAIN.horizon_url}/accounts/${user.walletAddress}">${user.walletAddress}</a></li>
<li>created: ${user.createdDate}</li>
<li>activated: ${user.activatedDate}</li>
<li><a href="/orders?user_id=${user.id}">orders</a></li>
</ul>`;
}

export async function getApplications(params: any, query: any): Promise<string> {
	const apps = await Application.find();
	let ret = "<table>";
	for (const app of apps) {
		ret += appToHtml(app);
	}
	ret += "</table>";
	return ret;
}

export async function getApplication(params: { app_id: string }, query: any): Promise<string> {
	const app = await Application.findOneById(params.app_id);
	if (!app) {
		throw new Error("no such app: " + params.app_id);
	}
	return `<table>${appToHtml(app)}</table>`;
}

export async function getApplicationUsers(params: { app_id: string }, query: any): Promise<string> {
	const users: User[] = await User.find({ appId: params.app_id });
	let ret = "";
	for (const user of users) {
		ret += userToHtml(user);
	}
	return ret;
}

export async function getOffers(params: any, query: any): Promise<string> {
	const offers = await Offer.find();
	let ret = `<table>${OFFER_HEADERS}`;
	for (const offer of offers) {
		ret += offerToHtml(offer);
	}
	ret += "</table>";
	return ret;
}

export async function getOffer(params: { offer_id: string }, query: any): Promise<string> {
	const offer = await Offer.findOneById(params.offer_id);
	if (!offer) {
		throw new Error("no such offer: " + params.offer_id);
	}
	return `<table>${OFFER_HEADERS}${offerToHtml(offer)}</table>`;
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

export async function getUserData(params: { user_id: string }, query: any): Promise<string> {
	const user: User | undefined = await User.findOneById(params.user_id);
	if (!user) {
		throw new Error("user not found: " + params.user_id);
	}
	return userToHtml(user);
}

export async function getApplicationUserData(params: { user_id: string, app_id: string }, query: any): Promise<string> {
	const user: User | undefined = await User.findOne({ appUserId: params.user_id, appId: params.app_id });
	if (!user) {
		throw new Error("user not found: " + params.user_id);
	}
	return userToHtml(user);
}

export async function getOrders(params: any, query: { status?: string, user_id?: string, offer_id?: string }): Promise<string> {
	const queryBy: { offerId?: string, userId?: string, status?: string } = {};
	if (query.offer_id) {
		queryBy.offerId = query.offer_id;
	}
	if (query.user_id) {
		queryBy.userId = query.user_id;
	}
	if (query.status) {
		queryBy.status = query.status;
	}
	let orders = await Order.find(queryBy);
	let ret = `<table>${ORDER_HEADERS}`;
	for (const order of orders) {
		ret += orderToHtml(order);
	}
	ret += "</table>";
	return ret;
}

export async function getOrder(params: { order_id: string }, query: any): Promise<string> {
	const order: Order | undefined = await Order.findOneById(params.order_id);
	if (!order) {
		throw new Error("order not found: " + params.order_id);
	}
	return `<table>${ORDER_HEADERS}${orderToHtml(order)}</table>`;
}

export async function getPollResults(params: { offer_id: string }, query: any): Promise<string> {
	const answers: PollAnswer[] = await PollAnswer.find({ offerId: params.offer_id });
	let ret = `<table>`;
	for (const answer of answers) {
		ret += `<tr><td><pre>${answer.content}</pre></td></tr>`;
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
