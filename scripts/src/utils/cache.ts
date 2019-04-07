import * as moment from "moment";

interface CacheValue {
	expiresAt: moment.Moment;
	data: any;
}

const defaultTTL = moment.duration(30, "seconds");
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
