import { Application } from "../models/applications";
import { Offer, PollAnswer } from "../models/offers";
import { getManager } from "typeorm";
import { User } from "../models/users";
import { OpenOrderStatus, Order } from "../models/orders";
import { IdPrefix, isNothing } from "../utils";
import { BlockchainConfig, getBlockchainConfig } from "../public/services/payment";
import { getDefaultLogger } from "../logging";
import { getOffers as getUserOffersService } from "../public/services/offers";
import * as payment from "../public/services/payment";

type OfferStats = {
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

type AppStats = {
	app_id: string
	total_users: number,
	total_activated: number,
	users_completed_earn: number,
	users_completed_spend: number,
	users_failed_earn: number,
	users_failed_spend: number,
	earn_orders: number,
	spend_orders: number,
	failed_earn_orders: number,
	failed_spend_orders: number,
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

const OFFER_STATS_HEADERS = `<tr>
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

const APP_STATS_HEADERS = `<tr>
<th>ID</th>
<th>total users</th>
<th>activated users</th>
<th>users completed earn</th>
<th>users completed spend</th>
<th>users failed earn</th>
<th>users failed spend</th>
<th>total earn orders</th>
<th>total spend orders</th>
<th>failed earn orders</th>
<th>failed spend orders</th>
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

function getOfferStatsQuery(offerId: string | "all") {
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
where a.id = '${ offerId }' or '${ offerId }' = 'all'
order by type desc, abs(ordered.num - owned.num) desc, ordered.num desc`;
}

function getApplicationStatsQuery(appId: string | "all") {
	return `
SELECT
	users.app_id,
	COUNT(DISTINCT users.id) AS total_users,
	COUNT(DISTINCT users.activated_date) AS total_activated,
	COUNT(DISTINCT earn.user_id) AS users_completed_earn,
	COUNT(DISTINCT spend.user_id) AS users_completed_spend,
	COUNT(DISTINCT failed_earn.user_id) AS users_failed_earn,
	COUNT(DISTINCT failed_spend.user_id) AS users_failed_spend,
	SUM(earn.num) AS earn_orders,
	SUM(spend.num) AS spend_orders,
	SUM(failed_earn.num) AS failed_earn_orders,
	SUM(failed_spend.num) AS failed_spend_orders
FROM
	users
	LEFT JOIN
		(
			SELECT orders_contexts.user_id, COUNT(*) AS num
			FROM
				orders
				LEFT JOIN orders_contexts
    				ON orders.id = orders_contexts.order_id
			WHERE
				(
					orders.status = 'completed'
					OR (
						(orders.status = 'pending' OR orders.status = 'opened')
						AND orders.expiration_date > NOW()
					)
				)
				AND orders_contexts.type = 'earn'
			GROUP BY orders_contexts.user_id
		) AS earn
	ON earn.user_id = users.id
	LEFT JOIN
		(
			SELECT orders_contexts.user_id, COUNT(*) AS num
			FROM
				orders
				LEFT JOIN orders_contexts
					ON orders.id = orders_contexts.order_id
			WHERE
				(
					orders.status = 'completed'
					OR (
						(orders.status = 'pending' OR orders.status = 'opened')
						AND orders.expiration_date > NOW()
					)
				)
				AND orders_contexts.type = 'spend'
			GROUP BY orders_contexts.user_id
		) AS spend
	ON spend.user_id = users.id
	LEFT JOIN
		(
			SELECT orders_contexts.user_id, COUNT(*) AS num
			FROM
				orders
				LEFT JOIN orders_contexts
					ON orders.id = orders_contexts.order_id
			WHERE
				(
					orders.status = 'failed'
					OR (orders.status = 'pending' AND orders.expiration_date < NOW())
				)
				AND orders_contexts.type = 'earn'
			GROUP BY orders_contexts.user_id
		) AS failed_earn
	ON failed_earn.user_id = users.id
	LEFT JOIN
		(
			SELECT orders_contexts.user_id, COUNT(*) AS num
			FROM
				orders
				LEFT JOIN orders_contexts
					ON orders.id = orders_contexts.order_id
			WHERE
				(
					orders.status = 'failed'
					OR (orders.status = 'pending' AND orders.expiration_date < NOW())
				)
				AND orders_contexts.type = 'spend'
			GROUP BY orders_contexts.user_id
		) AS failed_spend
	ON failed_spend.user_id = users.id
WHERE users.app_id = '${ appId }' OR '${ appId }' = 'all'
GROUP BY users.app_id;`;
}

function offerStatsToHtml(stats: OfferStats) {
	return `<tr>
<td>${ stats.id }</td>
<td>${ stats.name }</td>
<td>${ stats.type }</td>
<td>${ stats.total_cap }</td>
<td>${ stats.orders }</td>
<td>${ stats.failed_orders }</td>
<td>${ stats.assets_owned }</td>
<td>${ stats.assets_left }</td>
<td>${ stats.orders_missing_asset }</td>
</tr>`;
}

function appStatsToHtml(stats: AppStats) {
	return `<tr>
<td>${ stats.app_id }</td>
<td>${ stats.total_users }</td>
<td>${ stats.total_activated }</td>
<td>${ stats.users_completed_earn }</td>
<td>${ stats.users_completed_spend }</td>
<td>${ stats.users_failed_earn }</td>
<td>${ stats.users_failed_spend }</td>
<td>${ stats.earn_orders }</td>
<td>${ stats.spend_orders }</td>
<td>${ stats.failed_earn_orders }</td>
<td>${ stats.failed_spend_orders }</td>
</tr>`;
}

async function appToHtml(app: Application): Promise<string> {
	return `<tr>
<td>${ app.id }</td>
<td>${ app.name }</td>
<td>${ app.apiKey }</td>
<td><a href="/applications/${ app.id }/users">users</a></td>
<td><a href="/applications/${ app.id }/offers">offers</a></td>
<td><a href="/applications/${ app.id }/stats">stats</a></td>
<td><a href="${ BLOCKCHAIN.horizon_url }/accounts/${ app.walletAddresses.sender }">sender wallet (earn)</a></td>
<td><a href="${ BLOCKCHAIN.horizon_url }/accounts/${ app.walletAddresses.recipient }">recipient wallet (spend)</a></td>
<td><pre class="wide">${ JSON.stringify(app.jwtPublicKeys, null, 2) }</pre></td>
</tr>`;
}

async function offerToHtml(offer: Offer): Promise<string> {
	return `<tr>
<td>${ offer.id }</td>
<td><a href="/offers/${ offer.id }/stats">stats</a></td>
<td><a href="/orders?offer_id=${ offer.id }">orders</a></td>
<td><a href="/polls/${ offer.id }">polls</a></td>
<td>${ offer.name }</td>
<td>${ offer.type }</td>
<td>${ offer.amount }</td>
<td>${ offer.meta.title }</td>
<td>${ offer.meta.description }</td>
<td><img src="${offer.meta.image}"/></td>
<td><input type="text" onchange="submitData('/offers/${ offer.id }', { cap: { total: this.value } })" value="${ offer.cap.total }"/></td>
<td><input type="text" onchange="submitData('/offers/${ offer.id }', { cap: { per_user: this.value } })" value="${ offer.cap.per_user }"/></td>
<td>${ offer.ownerId }</td>
<td><a href="${ BLOCKCHAIN.horizon_url}/accounts/${ offer.blockchainData.recipient_address }">${ offer.blockchainData.recipient_address }</a></td>
<td><a href="${ BLOCKCHAIN.horizon_url}/accounts/${ offer.blockchainData.sender_address }">${ offer.blockchainData.sender_address }</a></td>
<td>${ offer.createdDate.toISOString() }</td>
</tr>`;
}

async function orderToHtml(order: Order): Promise<string> {
	const contexts = order.contexts || [];
	const transactionId = order.blockchainData ? order.blockchainData.transaction_id : null;
	const payJwt = order.value && order.value.type === "payment_confirmation" ? order.value.jwt : null;
	let html = "";

	for (const context of contexts) {
		html += `<tr>
<td><a href="/orders/${ order.id }">${ order.id }</a></td>
<td class="status_${ order.status }"><a href="/orders?status=${ order.status }">${ order.status }</a></td>
<td><pre>${ JSON.stringify(order.error) }</pre></td>
<td>${ order.origin }</td>
<td>${ context.type }</td>
<td><a href="/users/${ context.user.id }">${ context.user.id }</a></td>
<td>${ order.amount }</td>
<td>${ context.meta.title }</td>
<td>${ context.meta.description }</td>
<td><pre>${ context.meta.content }</pre></td>
<td><a href="/offers/${ order.offerId }">${ order.offerId }</a></td>
<td><a href="${ BLOCKCHAIN.horizon_url }/transactions/${ transactionId }">${ transactionId }</a></td>
<td>${ (order.currentStatusDate || order.createdDate).toISOString() }</td>
<td><pre><a href="https://jwt.io?token=${ payJwt }">${ payJwt }</a></pre></td>
</tr>`;
	}

	return html;
}

async function userToHtml(user: User): Promise<string> {
	return `
<ul>
<li>ecosystem id: <a href="/users/${ user.id }">${ user.id }</a></li>
<li>appId: ${ user.appId }</li>
<li>appUserId: ${ user.appUserId }</li>
<li>stellar account:
<a href="${ BLOCKCHAIN.horizon_url}/accounts/${ user.walletAddress }">${ user.walletAddress }</a>
<a href="/wallets/${ user.walletAddress }">balance</a>
<a href="/wallets/${ user.walletAddress }/payments">kin transactions</a>
</li>
<li>created: ${ user.createdDate }</li>
<li>activated: ${ user.activatedDate} </li>
<li><a href="/orders?user_id=${ user.id }">orders</a></li>
<li><a href="/users/${ user.id }/offers">offers</a></li>
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
	const app = await Application.findOne(params.app_id);
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
	const offer = await Offer.findOne(params.offer_id);
	if (!offer) {
		throw new Error("no such offer: " + params.offer_id);
	}
	return `<table>${ OFFER_HEADERS }${ await offerToHtml(offer) }</table>`;
}

export async function getOfferStats(params: { offer_id: string }, query: any): Promise<string> {
	const stats: OfferStats[] = await getManager().query(getOfferStatsQuery(params.offer_id));
	let ret = `<table>${ OFFER_STATS_HEADERS }`;
	for (const stat of stats) {
		ret += offerStatsToHtml(stat);
	}
	ret += "</table>";
	return ret;
}

export async function getAllOfferStats(params: any, query: any): Promise<string> {
	const stats: OfferStats[] = await getManager().query(getOfferStatsQuery("all"));

	let ret = `<table>${ OFFER_STATS_HEADERS }`;
	for (const stat of stats) {
		ret += offerStatsToHtml(stat);
	}
	ret += "</table>";
	return ret;
}

export async function getUserOffers(params: { user_id: string }, query: any): Promise<string> {
	const user = await User.findOne(params.user_id);
	if (!user) {
		throw new Error("user not found: " + params.user_id);
	}

	const offers = (await getUserOffersService(user.id, user.appId, {}, getDefaultLogger())).offers;
	let ret = `<table>${ OFFER_HEADERS }`;
	for (const offer of offers) {
		const dbOffer = (await Offer.findOne(offer.id))!;
		ret += await offerToHtml(dbOffer);
	}
	ret += "</table>";
	return ret;
}

export async function getUserData(params: { user_id: string }, query: any): Promise<string> {
	const user = await User.findOne(params.user_id);
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

	let ret = `<table>${ ORDER_HEADERS }`;
	for (const order of orders) {
		ret += await orderToHtml(order);
	}
	ret += "</table>";
	return ret;
}

export async function retryOrder(params: { order_id: string }, query: any): Promise<string> {
	const order = await Order.getOne(params.order_id);

	if (!order) {
		throw new Error("order not found: " + params.order_id);
	}
	if (order.status !== "failed" || order.isP2P() || order.contexts[0].type !== "earn") {
		throw new Error("cant retry non earn or non failed orders");
	}

	await payment.payTo(order.blockchainData.recipient_address!, order.contexts[0].user.appId, order.amount, order.id, getDefaultLogger());

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

export async function retryUserWallet(params: { user_id: string }, query: any): Promise<string> {
	const user = await User.findOne(params.user_id);
	if (!user) {
		throw new Error("user not found: " + params.user_id);
	}
	await payment.createWallet(user.walletAddress, user.appId, user.id, getDefaultLogger());
	return `<h3>Retrying...</h3>
<div><a href="/users/${ user.id }">Go Back</a>
<script>
window.setTimeout(function(){
        // Move to a new location or you can do something else
        window.location.href = "/users/${ user.id }";
    }, 5000);
</script>
</div>`;
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

export async function getApplicationStats(params: { app_id: string }, query: any): Promise<string> {
	const stats: AppStats[] = await getManager().query(getApplicationStatsQuery(params.app_id));
	let ret = `<table>${ APP_STATS_HEADERS }`;
	for (const stat of stats) {
		ret += appStatsToHtml(stat);
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
	const data = await payment.getWalletData(params.wallet_address, getDefaultLogger(), { timeout: 5000 });
	let ret = `<pre class="wide">${JSON.stringify(data, null, 2)}</pre>`;

	if (data.kin_balance === null) {
		ret = `<h3 class="alert">Untrusted!</h3>` + ret;
	}
	return ret;
}

export async function getWalletPayments(params: { wallet_address: string }, query: any): Promise<string> {
	const data = await payment.getPayments(params.wallet_address, getDefaultLogger(), { timeout: 5000 });
	return `<pre class="wide">${ JSON.stringify(data, null, 2) }</pre>`;
}

export async function changeOffer(body: Partial<Offer>, params: { offer_id: string }, query: any): Promise<any> {
	const offer = await Offer.findOne(params.offer_id);
	if (!offer) {
		throw new Error("no such offer: " + params.offer_id);
	}

	let didChange = false;
	if (body && body.cap) {
		if (body.cap.total && !isNothing(parseInt(body.cap.total as any, 10)) && parseInt(body.cap.total as any, 10) >= 0) {
			offer.cap.total = parseInt(body.cap.total as any, 10);
			didChange = true;
		}
		if (body.cap.per_user && !isNothing(parseInt(body.cap.per_user as any, 10)) && parseInt(body.cap.per_user as any, 10) >= 0) {
			offer.cap.per_user = parseInt(body.cap.per_user as any, 10);
			didChange = true;
		}
	}

	if (!didChange) {
		throw new Error("cap must be defined, a number and greater or equal to 0 - received: " + JSON.stringify(body));
	}

	await offer.save();
	return { offer };
}
