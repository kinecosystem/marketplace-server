import * as moment from "moment";

interface CacheValue {
	lastRefresh: moment.Moment;
	data: any;
}

interface CacheObj {
	key: string;
	value: CacheValue;
}

export class LocalCache {
	public static getInstance() {
		if (!this.instance) {
			this.instance = new this();
		}
		return this.instance;
	}

	private static instance: LocalCache;
	private readonly cache = {} as CacheObj;
	private readonly cacheTTL = 10; // minutes
	private constructor() {}

	public checkValidity(key: string): boolean {
		if (!(this.cache as any)[key]) { return false; }

		const { lastRefresh } = (this.cache as any)[key] as CacheValue;
		return moment.duration(moment().diff(lastRefresh)).asMinutes() <= this.cacheTTL;
	}

	public get(key: string) {
		return (this.cache as any)[key].data;
	}

	public set(key: string, data: any) {
		(this.cache as any)[key] = {
			lastRefresh: moment(),
			data
		};
	}
}
