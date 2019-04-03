import * as moment from "moment";
import { getConfig } from "../public/config";

const config = getConfig();

interface CacheValue {
	lastRefresh: moment.Moment;
	data: any;
}

const cacheTTL = config.cache_ttl.default; // minutes

const items = new Map<string, CacheValue>();
export const localCache = {
	get<T>(key: string): T | null {
		const value = items.get(key);
		if (value && moment.duration(moment().diff(value.lastRefresh)).asMinutes() <= cacheTTL) {
			return value.data;
		} else {
			return null;
		}
	},
	set(key: string, data: any) {
		items.set(key, {
			lastRefresh: moment(),
			data
		});
	},
	clear() {
		items.clear();
	}
};
