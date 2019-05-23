import { promisify } from "util";
import { RedisClient } from "redis";
import Redlock = require("redlock");

import { getConfig } from "./config";
import { getDefaultLogger as logger } from "./logging";

let isMocked = false;
let client: RedisAsyncClient;

export type RedisAsyncFunctions = {
	get(key: string): Promise<string>;
	mget(...key: string[]): Promise<string[]>;
	set(key: string, value: string): Promise<"OK">;
	setex(key: string, seconds: number, value: string): Promise<"OK">;
	del(key: string): Promise<number>;
	incrby(key: string, incValue: number): Promise<number>;
	sismember(key: string, member: string): Promise<number>;
	smembers(key: string): Promise<string[]>;
	sadd(key: string, member: string | string[]): Promise<"OK">;
};

export type RedisAsyncClient = RedisClient & {
	async: RedisAsyncFunctions;
};

export function getRedisClient(): RedisAsyncClient {
	if (!client) {
		if (getConfig().redis === "mock") {
			isMocked = true;
			client = require("redis-mock").createClient();
		} else {
			client = require("redis").createClient(getConfig().redis);
		}
		client.async = {} as RedisAsyncFunctions;
		["get", "mget", "set", "setex", "del", "incrby", "sismember", "smembers"].forEach(name => {
			(client.async as any)[name] =  promisify((client as any)[name]).bind(client);
		});
	}

	return client;
}

const redlock = new Redlock(
	[getRedisClient()],
	{
		// the expected clock drift; for more details
		// see http://redis.io/topics/distlock
		driftFactor: 0.01, // time in ms

		// the max number of times Redlock will attempt
		// to lock a resource before erroring
		retryCount:  10,

		// the time in ms between attempts
		retryDelay:  200, // time in ms

		// the max time in ms randomly added to retries
		// to improve performance under high contention
		// see https://www.awsarchitectureblog.com/2015/03/backoff.html
		retryJitter:  200 // time in ms
	}
);
redlock.on("clientError", error => {
	logger().error("redis lock client error: ", error);
});

export function acquireLock(resource: string, ttl: number = 1000): PromiseLike<Redlock.Lock> {
	return redlock.lock(resource, ttl);
}

export type LockHandler<T> = () => T | Promise<T>;
export function lock<T>(resource: string, fn: LockHandler<T>): Promise<T>;
export function lock<T>(resource: string, ttl: number, fn: LockHandler<T>): Promise<T>;
export async function lock<T>(resource: string, p1: number | LockHandler<T>, p2?: LockHandler<T>): Promise<T> {
	const ttl = typeof p1 === "number" ? p1 : 1000;
	const fn = typeof p1 === "number" ? p2! : p1;

	if (isMocked) {
		return Promise.resolve(fn());
	}

	const alock = await redlock.lock(resource, ttl);
	let result = fn();
	if ((result as Promise<any>).then) {
		result = await result;
	}

	await alock.unlock();

	return result as T;
}
