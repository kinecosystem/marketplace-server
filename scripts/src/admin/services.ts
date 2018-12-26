import { Application, AppOffer } from "../models/applications";
import { Cap, Offer, OfferContent, PollAnswer } from "../models/offers";
import { getManager } from "typeorm";
import { User } from "../models/users";
import { OpenOrderStatus, Order, OrderContext } from "../models/orders";
import { IdPrefix, isNothing } from "../utils/utils";
import * as payment from "../public/services/payment";
import { BlockchainConfig, getBlockchainConfig } from "../public/services/payment";
import { getOffers as getUserOffersService } from "../public/services/offers";
import { getOfferContent, replaceTemplateVars } from "../public/services/offer_contents";

type OfferStats = {
	id: string
	name: string,
	total_cap: number,
	orders: number,
	kin: number,
	failed_orders: number,
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
getBlockchainConfig().then(data => BLOCKCHAIN = data);

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

const OFFER_STATS_HEADERS = `<tr>
<th>ID</th>
<th>name</th>
<th>orders</th>
<th>kin</th>
<th>failed orders</th>
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

function getOfferStatsQuery(appId: string) {
	return `
	 with app_orders as (
    select
      orders.offer_id,
      orders.amount,
      orders.origin,
      context.type,
      orders.status,
      orders.expiration_date
    from orders
    inner join orders_contexts context on context.order_id = orders.id
    inner join users on users.id = context.user_id
    where users.app_id='${ appId }'
), app_offers as (
    select offers.*,
      (a.cap::json->'total')::text::integer as total_cap
    from offers
inner join application_offers a on offers.id = a.offer_id
where a.app_id='${ appId }')
select
  CASE WHEN offers.id IS NULL THEN CONCAT('native ', ordered.type) ELSE offers.id END as id,
  max(offers.name) as name,
  MAX(offers.total_cap) as total_cap,
  SUM(coalesce(ordered.num,0)) as orders,
  SUM(ordered.kin) as kin,
  SUM(coalesce(failed_orders.num, 0)) as failed_orders
from app_offers offers
full outer join (select offer_id, type, count(*) as num, sum(amount) as kin from app_orders where status = 'completed' group by offer_id, type) as ordered
on ordered.offer_id = offers.id
full outer join (select offer_id, type, count(*) as num from app_orders where status != 'completed' group by offer_id, type) as failed_orders
on failed_orders.offer_id = offers.id
group by id, ordered.type
order by orders desc`;
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
<td>${ stats.orders }</td>
<td>${ stats.kin }</td>
<td>${ stats.failed_orders }</td>
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
<td><a href="/applications/${ app.id }/offers/stats">offer stats</a></td>
<td><a href="${ BLOCKCHAIN.horizon_url }/accounts/${ app.walletAddresses.sender }">sender wallet (earn)</a></td>
<td><a href="${ BLOCKCHAIN.horizon_url }/accounts/${ app.walletAddresses.recipient }">recipient wallet (spend)</a></td>
<td><pre>${ JSON.stringify(app.jwtPublicKeys, null, 2) }</pre></td>
<td><pre>${ JSON.stringify(app.config, null, 2) }</pre></td>
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

	const OfferContent = ((await getOfferContent(offer.id)) || { contentType: "poll", content: "{}" });
	const offerIdHtml = OfferContent.contentType === "coupon" ? offer.id : `<a onclick="overlayOn(this.dataset.content, '${ offer.id }')" data-content="${ escape(OfferContent.content) }">${ offer.id }</a>`;
	return `<tr class='offer-row'>
<td class='offer-id'>${offerIdHtml}</td>
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
		html += `<tr>
<td><a href="/orders/${ order.id }">${ order.id }</a></td>
<td class="status_${ order.status }"><a href="/orders?status=${ order.status }">${ order.status }</a></td>
<td><pre>${ JSON.stringify(order.error) }</pre></td>
<td>${ order.origin }</td>
<td>${ context.type }</td>
<td><a href="/users/${ context.userId }">${ context.userId }</a></td>
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
	const accounts = (await user.getWallets()).all().map(wallet => {
		return `
		<a href="${ BLOCKCHAIN.horizon_url}/accounts/${ wallet.address }">${ wallet.address }</a>
		<a href="/wallets/${ wallet.address }">balance</a>
		<a href="/wallets/${ wallet.address }/payments">kin transactions</a>
		`;
	}).join("<br/>");

	return `
<ul>
	<li>ecosystem id: <a href="/users/${ user.id }">${ user.id }</a></li>
	<li>appId: ${ user.appId }</li>
	<li>appUserId: ${ user.appUserId }</li>
	<li>stellar accounts:<br/>${ accounts }</li>
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
	const app = await Application.findOneById(params.app_id);
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
		.addOrderBy("offer.created_date", "ASC")
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
	const offer = await Offer.findOneById(params.offer_id);
	if (!offer) {
		throw new Error("no such offer: " + params.offer_id);
	}
	return `<table>${ OFFER_HEADERS }${ await offerToHtml(offer) }</table>`;
}

export async function getOfferStats(params: { app_id: string }, query: any): Promise<string> {
	const stats: OfferStats[] = await getManager().query(getOfferStatsQuery(params.app_id));
	let ret = `<table>${ OFFER_STATS_HEADERS }`;
	for (const stat of stats) {
		ret += offerStatsToHtml(stat);
	}
	ret += "</table>";
	return ret;
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
	const q = await Order.queryBuilder("order");

	if (query.offer_id) {
		q.andWhere("offer_id = :offer_id", { offer_id: query.offer_id });
	}
	if (query.status) {
		q.andWhere("status = :status", { status: query.status });
	}
	if (query.user_id) {
		const contexts = await OrderContext.find({ userId: query.user_id });
		if (contexts.length > 0) {
			q.andWhere("id in (:ids)", { ids: contexts.map(c => c.orderId) });
		} else {
			q.andWhere("id = 'no-such-id' ");
		}
	}
	const orders = await q.orderBy("current_status_date", "DESC").skip(skip(query)).take(take(query)).getMany();

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
	await payment.createWallet(params.wallet, user.appId, user.id);
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

type ChangeOfferData = Partial<Offer> & {
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
