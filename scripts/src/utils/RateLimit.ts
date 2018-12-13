import * as moment from "moment";
import { getRedisClient, RedisAsyncClient } from "../redis";
import { TooManyRegistrations, TooMuchEarnOrdered } from "../errors";

class RateLimit {
	private readonly bucketPrefix: string;
	private readonly rateLimitValue: number;
	private readonly redis: RedisAsyncClient;
	private windowSize: number = 0;
	private ttl: number = 172800; // two days in seconds
	private readonly ttlWindowRatio: number = 10;

	constructor(bucketPrefix: string, rateLimitValue: number, windowSizeMomentObject: moment.Duration) {
		this.bucketPrefix = bucketPrefix;
		this.rateLimitValue = rateLimitValue;
		this.windowSize = windowSizeMomentObject.asSeconds();
		this.redis = getRedisClient();
	}

	public async checkRate(): Promise<boolean> {
		return await this.check(1);
	}

	public async checkAmount(amount: number): Promise<boolean> {
		return await this.check(amount);
	}

	private async check(step: number) {
		const bucketSize = Math.max(this.windowSize / 60, 1); // resolution
		const currentTimestampSeconds = Math.floor((Date.now() / 1000) / bucketSize) * bucketSize; // int(currentTimestampSeconds / 60) * 60
		const currentBucketName = this.bucketPrefix + currentTimestampSeconds;

		await this.redis.async.incrby(currentBucketName, step);
		this.redis.expire(currentBucketName, this.ttl);

		const windowKeys: string[] = [this.bucketPrefix + currentTimestampSeconds.toString()];
		for (let i = 0; i < this.windowSize; i += bucketSize) {
			windowKeys.push(this.bucketPrefix + (currentTimestampSeconds - i));
		}

		const rateSum: number = (await this.redis.async.mget(...windowKeys))
			.filter((val: string) => val) // windowKeys consists of all possible keys even not existed, mget returns nulls for non-existing keys
			.map(v => { console.log(v); return v; } )
			.reduce((sum: number, val: string) => sum + Number(val), 0);

		return rateSum > this.rateLimitValue;
	}
}

export async function throwOnRateLimit(appId: string, type: string, limit: number, duration: moment.Duration) {
	const rateLimitPrefix: string = "rate_limit";
	const bucketPrefix: string = `${rateLimitPrefix}:${appId}:${type}:`;
	const rateLimit: RateLimit = new RateLimit(bucketPrefix, limit, duration);
	if (await rateLimit.checkRate()) {
		throw TooManyRegistrations(`app: ${appId}, type: ${type} exceeded the limit: ${limit}`);
	}
}

export async function throwOnAppEarnLimit(appId: string, type: string, limit: number, duration: moment.Duration, amount: number) {
	const rateLimitPrefix: string = "amount_limit";
	const bucketPrefix: string = `${rateLimitPrefix}:${appId}:${type}:`;
	const rateLimit: RateLimit = new RateLimit(bucketPrefix, limit, duration);
	if (await rateLimit.checkAmount(amount)) {
		throw TooMuchEarnOrdered(`app: ${appId}, type: ${type} exceeded the limit: ${limit}, amount: ${amount}`);
	}
}

export async function throwOnUserEarnLimit(userId: string, type: string, limit: number, duration: moment.Duration, amount: number) {
	const rateLimitPrefix: string = "amount_limit";
	const bucketPrefix: string = `${rateLimitPrefix}:${userId}:${type}:`;
	const rateLimit: RateLimit = new RateLimit(bucketPrefix, limit, duration);
	if (await rateLimit.checkAmount(amount)) {
		throw TooMuchEarnOrdered(`user: ${userId}, type: ${type} exceeded the limit: ${limit}, amount: ${amount}`);
	}
}
