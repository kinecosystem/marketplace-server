import { getConfig } from "./config";
import { StatsD } from "hot-shots";

// XXX can add general tags to the metrics (i.e. - public/ internal, machine name etc)
const statsd = new StatsD(getConfig().statsd);

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
