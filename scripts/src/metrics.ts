import { StatsD } from "hot-shots";

import { getConfig } from "./config";
import { MarketplaceError } from "./errors";
import { Order } from "./models/orders";

// XXX can add general tags to the metrics (i.e. - public/ internal, machine name etc)
const statsd = new StatsD(Object.assign({ prefix: "marketplace_" }, getConfig().statsd));

export function destruct() {
	return new Promise(resolve => statsd.close(() => resolve()));
}

export function userRegister(newUser: boolean, newWallet: boolean) {
	statsd.increment("user_register", 1, { new_user: newUser.toString(), new_wallet: newWallet.toString() });
}

export function walletAddressUpdate() {
	statsd.increment("wallet_address_update_succeeded", 1);
}

export function userActivate(newUser: boolean) {
	statsd.increment("user_activate", 1, { new_user: "true" });
}

export function maxWalletsExceeded() {
	statsd.increment("max_wallets_exceeded", 1);
}

export function timeRequest(time: number, method: string, path: string) {
	statsd.timing("request", time, { method, path });
}

export function createOrder(orderType: "marketplace" | "external", offerType: "earn" | "spend", offerId: string) {
	statsd.increment("create_order", 1, { order_type: orderType, offer_type: offerType, offer_id: offerId });
}

export function submitOrder(offerType: "earn" | "spend", offerId: string) {
	statsd.increment("submit_order", 1, { offer_type: offerType, offer_id: offerId });
}

export function completeOrder(offerType: "earn" | "spend", offerId: string, prevStatus: string, time: number) {
	statsd.increment("complete_order", 1, { offer_type: offerType, offer_id: offerId });
	// time from last status
	statsd.timing("complete_order_time", time, { offer_type: offerType, prev_status: prevStatus });
}

export function offersReturned(numOffers: number, appId: string) {
	statsd.histogram("offers_returned", numOffers, { app_id: appId });
}

export function reportClientError(error: MarketplaceError, appId: string) {
	statsd.increment("client_error", 1,
		{ status: error.status.toString(), title: error.title, code: error.code.toString(), app_id: appId });
}

export function reportServerError(method: string, path: string) {
	statsd.increment("server_error", 1, { method, path });
}

export function reportProcessAbort(reason: string = "") {
	statsd.increment("process_abort", 1, { system: "exit", reason });
}

export function orderFailed(order: Order) {
	function safeString(str: string): string {
		return str.replace(/\W/g, " ");
	}

	const unknownError = { error: "unknown_error", message: "unknown error", code: -1 };
	const unknownUser = { id: "no_id", appId: "no_id", appUserId: "no_id", walletAddress: "no_wallet" };
	const error = order.error || unknownError;
	const title = safeString(error.message);
	const type = order.isP2P() ? "p2p" : order.contexts[0].type;
	const appId = order.contexts[0].user.appId;
	let message = `## Order <${ order.id }> from ${ appId } failed:
ID: <${ order.id }> | Type: ${ type } | Origin: ${ order.origin }
Error: ${ title } | Code: ${ error.code }
CreatedDate: ${order.createdDate.toISOString()} | LastDate: ${(order.currentStatusDate || order.createdDate).toISOString()}`;

	order.forEachContext(context => {
		message += `UserId: ${ context.user.id } | UserAppId: ${ context.user.appUserId } | Wallet: ${ context.user.walletAddress }`;
	});
	statsd.event(title, message,
		{ alert_type: "warning" },
		{
			order_type: type,
			app_id: appId,
			order_id: order.id,
			order_origin: order.origin,
			type: "failed_order"
		});
}
