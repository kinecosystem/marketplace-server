import { StatsD } from "hot-shots";

import { getConfig } from "./config";
import { MarketplaceError } from "./errors";
import { Order } from "./models/orders";

// XXX can add general tags to the metrics (i.e. - public/ internal, machine name etc)
const statsd = new StatsD(Object.assign({ prefix: "marketplace_" }, getConfig().statsd));

export function userRegister(newUser: boolean, walletCreated: boolean) {
	statsd.increment("user_register", 1, undefined, { new_user: newUser.toString() });
}

export function userActivate(newUser: boolean) {
	statsd.increment("user_activate", 1, undefined, { new_user: "true" });
}

export function timeRequest(time: number, method: string, path: string) {
	statsd.timing("request", time, undefined, { path: `${method}: ${path}` });
}

export function submitOrder(offerType: "earn" | "spend", offerId: string) {
	statsd.increment("submit_order", 1, undefined, { offer_type: offerType, offer_id: offerId });
}

export function completeOrder(offerType: "earn" | "spend", offerId: string) {
	statsd.increment("complete_order", 1, undefined, { offer_type: offerType, offer_id: offerId });
}

export function offersReturned(numOffers: number) {
	statsd.histogram("offers_returned", numOffers);
}

export function reportClientError(error: MarketplaceError) {
	statsd.increment("client_error", 1, undefined, { status: error.status.toString(), title: error.title });
}

export function reportServerError(method: string, path: string) {
	statsd.increment("server_error", 1, undefined, { method, path });
}

export function orderFailed(order: Order, appId: string) {
	const unknownError = { error: "unknown_error", message: "unknown error" };
	const message = `
## Order <${order.id}> transitioned to failed state.
Details:
* ID: ${order.id}
* Origin: ${order.origin}
* Type: ${order.type}
* AppId: ${appId}
* UserId: ${order.userId}
* Error: ${(order.error || unknownError).message}>
* CreatedDate: ${order.createdDate.toISOString()}
* LastDate: ${(order.currentStatusDate || order.createdDate).toISOString()}
`;
	const title = `order failed: ${(order.error || unknownError).error}`;
	statsd.event(title, message, { alert_type: "warning" }, { order_type: order.type, app_id: appId, order_id: order.id, order_origin: order.origin, type: "failed_order" });
}
