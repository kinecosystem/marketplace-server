import { StatsD } from "hot-shots";

import { getConfig } from "./config";
import { MarketplaceError } from "./errors";
import { Order } from "./models/orders";
import { User } from "./models/users";

// XXX can add general tags to the metrics (i.e. - public/ internal, machine name etc)
const statsd = new StatsD(Object.assign({ prefix: "marketplace_" }, getConfig().statsd));

export function userRegister(newUser: boolean, walletCreated: boolean) {
	statsd.increment("user_register", 1, undefined, { new_user: newUser.toString() });
}

export function userActivate(newUser: boolean) {
	statsd.increment("user_activate", 1, undefined, { new_user: "true" });
}

export function timeRequest(time: number, method: string, path: string) {
	statsd.timing("request", time, undefined, { path: `${ method }: ${ path }` });
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

export function orderFailed(order: Order, user?: User) {
	const unknownError = { error: "unknown_error", message: "unknown error", code: -1 };
	const unknownUser = { id: "no_id", appId: "no_id", appUserId: "no_id", walletAddress: "no_wallet" };

	const message = `
## Order <${order.id}> transitioned to failed state:
ID: <${order.id}> | Type: ${order.type} | Origin: ${order.origin}
UserId: ${(user || unknownUser).id} | AppId: <${(user || unknownUser).appId}> | UserAppId: ${(user || unknownUser).appUserId}
Wallet: ${(user || unknownUser).walletAddress}
Error: ${(order.error || unknownError).message} | Code: ${(order.error || unknownError).code}
CreatedDate: ${order.createdDate.toISOString()} | LastDate: ${(order.currentStatusDate || order.createdDate).toISOString()}
`;
	const title = (order.error || unknownError).message;
	statsd.event(title, message,
		{ alert_type: "warning" },
		{
			order_type: order.type,
			app_id: (user || unknownUser).appId,
			order_id: order.id,
			order_origin: order.origin,
			type: "failed_order" });
}
