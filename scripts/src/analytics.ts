import { getConfig } from "./config";
import { StatsD } from "hot-shots";

const statsd = new StatsD(getConfig().statsd);

// XXX this class can add general tags to the metrics (i.e. - public/ internal, machine name etc)
export class Metrics {
	constructor() {}

	public userRegister(newUser: boolean, walletCreated: boolean) {
		statsd.increment("user_register", 1, undefined, { new_user: newUser.toString() });
	}

	public userActivate(newUser: boolean) {
		statsd.increment("user_activate", 1, undefined, { new_user: "true" });
	}

	public timeRequest(time: number, method: string, path: string) {
		statsd.timing("request", time, undefined, { path: `${method}: ${path}` });
	}

	public submitOrder(offerType: "earn" | "spend", offerId: string) {
		statsd.increment("submit_order", 1, undefined, { offer_type: offerType, offer_id: offerId });
	}

	public completeOrder(offerType: "earn" | "spend", offerId: string) {
		statsd.increment("complete_order", 1, undefined, { offer_type: offerType, offer_id: offerId });
	}

	public offersReturned(numOffers: number) {
		statsd.histogram("offers_returned", numOffers);
	}
}

export const metrics = new Metrics();
