import * as moment from "moment";

import { getRedisClient, RedisAsyncClient } from "../redis";
import { MarketplaceError, TooManyRegistrations, TooManyUserRequests, TooMuchEarnOrdered } from "../errors";
import { User } from "../models/users";
import { Application } from "../models/applications";
import { getOrDefault } from "./utils";

export class RateLimit {
	public readonly bucketPrefix: string;
	public readonly redis: RedisAsyncClient;
	// window size in seconds
	public readonly windowSize: number = 0;
	// size of one bucket in seconds (at least 1 seconds)
	public readonly bucketSize: number = 0;
	public readonly currentTimestampSeconds: number = 0;
	public readonly ttl: number;

	constructor(bucketPrefix: string, windowSizeMomentObject: moment.Duration, now: number, numBuckets: number = 60) {
		this.redis = getRedisClient();
		this.bucketPrefix = `rate_limit:${ bucketPrefix }:`;

		this.windowSize = windowSizeMomentObject.asSeconds();
		this.bucketSize = Math.max(this.windowSize / numBuckets, 1); // resolution

		this.ttl = this.windowSize * 2;  // twice the size of the window
		// truncate the timestamp to the closest bucket
		this.currentTimestampSeconds = Math.trunc(now / 1000 / this.bucketSize) * this.bucketSize;
	}

	public async inc(step: number): Promise<void> {
		const currentBucketName = this.bucketPrefix + this.currentTimestampSeconds;
		await this.redis.async.incrby(currentBucketName, step);
		this.redis.expire(currentBucketName, this.ttl);
	}

	public getWindowKeys(): string[] {
		const windowKeys: string[] = [];
		for (let i = 0; i < this.windowSize; i += this.bucketSize) {
			windowKeys.push(this.bucketPrefix + (this.currentTimestampSeconds - i));
		}
		return windowKeys;
	}

	/**
	 * calculates possible Redis keys for this.windowSize every step (in seconds)
	 * Redis mget returns values for all these keys
	 * filter it and sum
	 */
	public async count() {
		const bucketValues = await this.redis.async.mget(...this.getWindowKeys());

		const rateSum: number = bucketValues
			.filter((val: string) => val) // windowKeys consists of all possible keys even not existed, mget returns nulls for non-existing keys
			.reduce((sum: number, val: string) => sum + Number(val), 0);

		return rateSum;
	}
}

// throw error when action should be limited
async function checkRateLimit(type: string, duration: moment.Duration, limit: number, error: (msg: string) => MarketplaceError, step: number = 1, numBuckets: number = 60): Promise<RateLimit> {
	const limiter = new RateLimit(type, duration, Date.now(), numBuckets);
	const rateCount = await limiter.count();
	// first check if adding the step is over the limit. If so action should be limited
	if (rateCount + step > limit) {
		throw error(`type: ${ type } exceeded the limit: ${ limit } with: ${ rateCount + step }`);
	}
	return limiter;
}

async function checkRateLimitAppEarn(appId: string, limit: number, duration: moment.Duration, amount: number) {
	return await checkRateLimit(`app_earn:${ appId }:${ duration.asSeconds() }`, duration, limit, TooMuchEarnOrdered, amount);
}

async function checkRateLimitUserEarn(userId: string, limit: number, duration: moment.Duration, amount: number) {
	return await checkRateLimit(`user_earn:${ userId }:${ duration.asSeconds() }`, duration, limit, TooMuchEarnOrdered, amount);
}

async function checkRateLimitWalletEarn(wallet: string, limit: number, duration: moment.Duration, amount: number) {
	return await checkRateLimit(`wallet_earn:${ wallet }:${ duration.asSeconds() }`, duration, limit, TooMuchEarnOrdered, amount);
}

export async function assertRateLimitEarn(user: User, walletAddress: string, amount: number) {
	const app = (await Application.get(user.appId))!;
	const limiters = [
		await checkRateLimitAppEarn(app.id, app.config.limits.minute_total_earn, moment.duration({ minutes: 1 }), amount),
		await checkRateLimitAppEarn(app.id, app.config.limits.hourly_total_earn, moment.duration({ hours: 1 }), amount),
		await checkRateLimitUserEarn(user.id, app.config.limits.daily_user_earn, moment.duration({ days: 1 }), amount),
		await checkRateLimitWalletEarn(walletAddress, app.config.limits.daily_user_earn, moment.duration({ days: 1 }), amount)
	];
	await Promise.all(limiters.map(limiter => limiter.inc(amount)));
}

async function checkRateLimitRegistration(appId: string, limit: number, duration: moment.Duration) {
	return await checkRateLimit(`register:${ appId }:${ duration.asSeconds() }`, duration, limit, TooManyRegistrations);
}

export async function assertRateLimitRegistration(app: Application) {
	const limiters = [
		await checkRateLimitRegistration(app.id, app.config.limits.hourly_registration, moment.duration({ hours: 1 })),
		await checkRateLimitRegistration(app.id, app.config.limits.minute_registration, moment.duration({ minutes: 1 }))
	];
	await Promise.all(limiters.map(limiter => limiter.inc(1)));
}

async function checkRateLimitUserRequests(userId: string, limit: number, duration: moment.Duration) {
	return await checkRateLimit(`user_reqs:${ userId }:${ duration.asSeconds() }`, duration, limit, TooManyUserRequests,
		1, 2); // use lower number of buckets to reduce stress on redis as this is called on each user request
}

export async function assertRateLimitUserRequests(user: User) {
	const app = (await Application.get(user.appId))!;

	const limiters = [
		await checkRateLimitUserRequests(user.id, getOrDefault(app.config.limits.hourly_user_requests, 250), moment.duration({ hours: 1 })),
		await checkRateLimitUserRequests(user.id, getOrDefault(app.config.limits.minute_user_requests, 50), moment.duration({ minutes: 1 }))
	];
	await Promise.all(limiters.map(limiter => limiter.inc(1)));
}

async function checkRateLimitMigration(appId: string, limit: number, duration: moment.Duration) {
	return await checkRateLimit(`migration:${ appId }:${ duration.asSeconds() }`, duration, limit, TooManyUserRequests,
		1, 2); // use lower number of buckets to reduce stress on redis as this is called on each user request
}

export async function assertRateLimitMigration(appId: string) {
	const app = (await Application.get(appId))!;

	const limiters = [
		await checkRateLimitMigration(app.id, getOrDefault(app.config.limits.hourly_migration, 72000), moment.duration({ hours: 1 })),
		await checkRateLimitMigration(app.id, getOrDefault(app.config.limits.minute_migration, 1200), moment.duration({ minutes: 1 })),
	];
	await Promise.all(limiters.map(limiter => limiter.inc(1)));
}
