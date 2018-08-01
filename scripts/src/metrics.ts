import { StatsD } from "hot-shots";

import { getConfig } from "./config";
import { MarketplaceError } from "./errors";
import { Order } from "./models/orders";
import { User } from "./models/users";

// XXX can add general tags to the metrics (i.e. - public/ internal, machine name etc)
const statsd = new StatsD(Object.assign({ prefix: "marketplace_" }, getConfig().statsd));

export function userRegister(newUser: boolean, walletCount: number) {
	statsd.increment("user_register", 1, undefined, { new_user: newUser.toString(), wallet_count: walletCount.toString() });
}

export function userActivate(newUser: boolean) {
	statsd.increment("user_activate", 1, undefined, { new_user: "true" });
}

export function maxWalletsExceeded() {
	statsd.increment("max_wallets_exceeded", 1, undefined);
}

export function timeRequest(time: number, method: string, path: string) {
	statsd.timing("request", time, undefined, { path: `${ method }: ${ path }` });
}

export function createOrder(orderType: "marketplace" | "external", offerType: "earn" | "spend", offerId: string) {
	statsd.increment("create_order", 1, undefined, { order_type: orderType, offer_type: offerType, offer_id: offerId });
}

export function submitOrder(offerType: "earn" | "spend", offerId: string) {
	statsd.increment("submit_order", 1, undefined, { offer_type: offerType, offer_id: offerId });
}

export function completeOrder(offerType: "earn" | "spend", offerId: string, prevStatus: string, time: number) {
	statsd.increment("complete_order", 1, undefined, { offer_type: offerType, offer_id: offerId });
	// time from last status
	statsd.timing("complete_order_time", time, undefined, { offer_type: offerType, prev_status: prevStatus });
}

export function offersReturned(numOffers: number, appId: string) {
	statsd.histogram("offers_returned", numOffers, undefined, { app_id: appId });
}

export function reportClientError(error: MarketplaceError, headers: { [name: string]: string }) {
	const data = Object.assign({ status: error.status.toString(), title: error.title }, headers);
	statsd.increment("client_error", 1, undefined, data);
}

export function reportServerError(method: string, path: string) {
	statsd.increment("server_error", 1, undefined, { method, path });
}

export function orderFailed(order: Order, relatedUser?: User) {
	function safeString(str: string): string {
		return str.replace(/\W/g, " ");
	}

	const unknownError = { error: "unknown_error", message: "unknown error", code: -1 };
	const unknownUser = { id: "no_id", appId: "no_id", appUserId: "no_id", walletAddress: "no_wallet" };

	const error = order.error || unknownError;
	const user = relatedUser || unknownUser;

	const message = `
## Order <${order.id}> transitioned to failed state:
ID: <${order.id}> | Type: ${order.type} | Origin: ${order.origin}
UserId: ${user.id} | AppId: <${user.appId}> | UserAppId: ${user.appUserId}
Wallet: ${user.walletAddress}
Error: ${safeString(error.message)} | Code: ${error.code}
CreatedDate: ${order.createdDate.toISOString()} | LastDate: ${(order.currentStatusDate || order.createdDate).toISOString()}
`;
	const title = safeString(error.message);
	statsd.event(title, message,
		{ alert_type: "warning" },
		{
			order_type: order.type,
			app_id: user.appId,
			order_id: order.id,
			order_origin: order.origin,
			type: "failed_order" });
}
