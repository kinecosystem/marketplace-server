import * as moment from "moment";

import { getRedisClient, RedisAsyncClient } from "../redis";
import { TooManyRegistrations, TooMuchEarnOrdered } from "../errors";

class RateLimit {
	private readonly bucketPrefix: string;
	private readonly rateLimitValue: number;
	private readonly redis: RedisAsyncClient;
	private readonly windowSize: number = 0;
	private readonly bucketSize: number = 0;
	private readonly currentTimestampSeconds: number = 0;
	private readonly ttl: number = moment.duration({ days: 2 }).asSeconds(); // two days in seconds

	/**
	 * @param      {string}  bucketPrefix
	 * @param      {number}  rateLimitValue
	 * @param      {moment.Duration}  windowSizeMomentObject
	 *
	 * this.windowSize = windowSizeMomentObject in seconds
	 * this.bucketSize = size of one bucket in seconds (at least 1 seconds)
	 */
	constructor(bucketPrefix: string, rateLimitValue: number, windowSizeMomentObject: moment.Duration) {
		this.bucketPrefix = bucketPrefix;
		this.rateLimitValue = rateLimitValue;
		this.windowSize = windowSizeMomentObject.asSeconds();
		this.bucketSize = Math.max(this.windowSize / 60, 1); // resolution
		this.currentTimestampSeconds = Math.trunc(Date.now() / 1000);
		this.redis = getRedisClient();
	}

	public async checkRate(): Promise<number> {
		this.createOrUpdateBucket(1);
		return await this.getSum();
	}

	public async checkAmount(amount: number): Promise<number> {
		this.createOrUpdateBucket(amount);
		return await this.getSum();
	}

	private async createOrUpdateBucket(step: number): Promise<void> {
		const currentBucketName = this.bucketPrefix + this.currentTimestampSeconds;
		await this.redis.async.incrby(currentBucketName, step);
		this.redis.expire(currentBucketName, this.ttl);
	}

	/**
	 * calculates possible Redis keys for this.windowSize every step (in seconds)
	 * Redis mget returns values for all these keys
	 * filter it and sum
	 *
	 * @param      {number}  step    step in seconds
	 * @return     {number}  sum
	 */
	private async getSum() {
		const windowKeys: string[] = [];
		for (let i = 0; i < this.windowSize; i += this.bucketSize) {
			windowKeys.push(this.bucketPrefix + (this.currentTimestampSeconds - i));
		}
		const bucketValues = await this.redis.async.mget(...windowKeys);

		const rateSum: number = bucketValues
			.filter((val: string) => val) // windowKeys consists of all possible keys even not existed, mget returns nulls for non-existing keys
			.reduce((sum: number, val: string) => sum + Number(val), 0);

		return rateSum;
	}
}

export async function throwOnRateLimit(appId: string, type: string, limit: number, duration: moment.Duration) {
	const rateLimitPrefix: string = "rate_limit";
	const bucketPrefix: string = `${ rateLimitPrefix }:${ appId }:${ type }:`;
	const rateLimit: RateLimit = new RateLimit(bucketPrefix, limit, duration);
	const rateCount = await rateLimit.checkRate();
	if (rateCount > limit) {
		throw TooManyRegistrations(`app: ${ appId }, type: ${ type } exceeded the limit: ${ limit } with: ${ rateCount }`);
	}
}

export async function throwOnAppEarnLimit(appId: string, type: string, limit: number, duration: moment.Duration, amount: number) {
	const rateLimitPrefix: string = "amount_limit";
	const bucketPrefix: string = `${ rateLimitPrefix }:${ appId }:${ type }:`;
	const rateLimit: RateLimit = new RateLimit(bucketPrefix, limit, duration);
	const appEarnSum = await rateLimit.checkAmount(amount);
	if (appEarnSum > limit) {
		throw TooMuchEarnOrdered(`app: ${ appId }, type: ${ type } exceeded the limit: ${ limit } with: ${ appEarnSum }`);
	}
}

export async function throwOnUserEarnLimit(userId: string, type: string, limit: number, duration: moment.Duration, amount: number) {
	const rateLimitPrefix: string = "amount_limit";
	const bucketPrefix: string = `${ rateLimitPrefix }:${ userId }:${ type }:`;
	const rateLimit: RateLimit = new RateLimit(bucketPrefix, limit, duration);
	const userEarnSum = await rateLimit.checkAmount(amount);
	if (userEarnSum > limit) {
		throw TooMuchEarnOrdered(`user: ${ userId }, type: ${ type } exceeded the limit: ${ limit } with: ${ userEarnSum }`);
	}
}
