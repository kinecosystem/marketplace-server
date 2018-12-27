import * as moment from "moment";

interface CacheValue {
	lastRefresh: moment.Moment;
	data: any;
}

interface CacheObj {
	[key: string]: CacheValue;
}

const cacheTTL = 10; // minutes
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
