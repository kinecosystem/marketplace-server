import * as moment from "moment";
import { getConfig } from "../public/config";

const config = getConfig();

interface CacheValue {
	expiresAt: moment.Moment;
	data: any;
}

const cacheTTL = config.cache_ttl.default; // minutes

const defaultTTL = moment.duration(cacheTTL, "seconds");
const items = new Map<string, CacheValue>();

export const localCache = {
	get<T>(key: string): T | null {
		const value = items.get(key);
		if (value && moment().isBefore(value.expiresAt)) {
			return value.data;
		} else {
			return null;
		}
	},
	set(key: string, data: any, expiration: moment.Duration = defaultTTL) {
		items.set(key, {
			expiresAt: moment().add(expiration),
			data
		});
	},
	clear() {
		items.clear();
	}
};
