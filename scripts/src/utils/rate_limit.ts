import * as moment from "moment";

import { getRedisClient, RedisAsyncClient } from "../redis";
import { MarketplaceError, TooManyRegistrations, TooMuchEarnOrdered } from "../errors";
import { Application } from "../models/applications";

class RateLimit {
	private readonly bucketPrefix: string;
	private readonly redis: RedisAsyncClient;
	private readonly windowSize: number = 0;
	private readonly bucketSize: number = 0;
	private readonly currentTimestampSeconds: number = 0;
	private readonly ttl: number;

	/**
	 * @param      {string}  bucketPrefix
	 * @param      {moment.Duration}  windowSizeMomentObject
	 *
	 * this.windowSize = windowSizeMomentObject in seconds
	 * this.bucketSize = size of one bucket in seconds (at least 1 seconds)
	 */
	constructor(bucketPrefix: string, windowSizeMomentObject: moment.Duration) {
		this.bucketPrefix = `rate_limit:${ bucketPrefix }:`;
		this.currentTimestampSeconds = Math.trunc(Date.now() / 1000);
		this.windowSize = windowSizeMomentObject.asSeconds();
		this.bucketSize = Math.max(this.windowSize / 60, 1); // resolution
		this.ttl = this.windowSize * 2;  // twice the size of the window
		this.redis = getRedisClient();
	}

	public async inc(step: number): Promise<void> {
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
	public async count() {
		const windowKeys: string[] = [];
		for (let i = 0; i < this.windowSize; i++) {
			windowKeys.push(this.bucketPrefix + (this.currentTimestampSeconds - i));
		}
		const bucketValues = await this.redis.async.mget(...windowKeys);

		const rateSum: number = bucketValues
			.filter((val: string) => val) // windowKeys consists of all possible keys even not existed, mget returns nulls for non-existing keys
			.reduce((sum: number, val: string) => sum + Number(val), 0);

		return rateSum;
	}
}

// throw error when action should be limited
async function assertRateLimit(type: string, duration: moment.Duration, limit: number, error: (msg: string) => MarketplaceError, step: number = 1): Promise<void> {
	const limiter = new RateLimit(type, duration);
	const rateCount = await limiter.count();
	// first check if adding the step is over the limit. If so action should be limited
	if (rateCount + step > limit) {
		throw error(`type: ${ type } exceeded the limit: ${ limit } with: ${ rateCount + step }`);
	}
	// otherwise, increment and allow the action
	await limiter.inc(step);
}

export async function assertRateLimitRegistration(appId: string, limit: number, duration: moment.Duration) {
	await assertRateLimit(`register:${ appId }:${ duration.asSeconds() }`, duration, limit, TooManyRegistrations);
}

export async function assertRateLimitAppEarn(appId: string, limit: number, duration: moment.Duration, amount: number) {
	await assertRateLimit(`app_earn:${ appId }:${ duration.asSeconds() }`, duration, limit, TooMuchEarnOrdered, amount);
}

export async function assertRateLimitUserEarn(userId: string, limit: number, duration: moment.Duration, amount: number) {
	await assertRateLimit(`user_earn:${ userId }:${ duration.asSeconds() }`, duration, limit, TooMuchEarnOrdered, amount);
}

export async function assertRateLimitWalletEarn(wallet: string, limit: number, duration: moment.Duration, amount: number) {
	await assertRateLimit(`wallet_earn:${ wallet }:${ duration.asSeconds() }`, duration, limit, TooMuchEarnOrdered, amount);
}
