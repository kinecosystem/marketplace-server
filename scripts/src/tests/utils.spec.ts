import * as path from "path";
import * as moment from "moment";

import * as utils from "../utils/utils";

import { path as _path } from "../utils/path";
import * as metrics from "../metrics";
import * as helpers from "./helpers";
import { LimitConfig } from "../config";
import { initLogger } from "../logging";
import { MarketplaceError } from "../errors";
import { close as closeModels, init as initModels } from "../models/index";
import { assertRateLimitEarn, RateLimit } from "../utils/rate_limit";
import { localCache } from "../utils/cache";
import { delay } from "../utils/utils";

describe("util functions", () => {
	test("path should return absolute path in the project", () => {
		expect(_path("my.file")).toEqual(path.resolve(__dirname, "../../../", "my.file"));
	});
	beforeEach(async done => {
		initLogger();
		await initModels();
		await helpers.clearDatabase();
		await helpers.createOffers();
		helpers.patchDependencies();

		done();
	});
	afterEach(async done => {
		await closeModels();
		done();
	});
	afterAll(async () => {
		await metrics.destruct();
	});

	describe("random functions", () => {
		function testRandomNumber(num: number, min: number, max: number) {
			expect(num).toBeGreaterThanOrEqual(min);
			expect(num).toBeLessThan(max);
		}

		function testRandomInteger(num: number, min: number, max: number) {
			expect(Number.isInteger(num)).toBeTruthy();
			testRandomNumber(num, min, max);
		}

		test("throwOnAppEarnLimit should fail on 4th request if limit is set to 3 queries", async () => {
			const limits: LimitConfig = {
				hourly_registration: 20000,
				minute_registration: 1000,
				hourly_total_earn: 500000,
				minute_total_earn: 300,
				daily_user_earn: 500
			};
			const app = await helpers.createApp(utils.generateId(), limits);
			const user = await helpers.createUser({ appId: app.id });
			const wallet = (await user.getWallets()).lastUsed()!.address;

			for (let i = 0; i < 3; i++) {
				await assertRateLimitEarn(user, wallet, 100);
			}

			try {
				await assertRateLimitEarn(user, wallet, 100);
				expect(true).toBeFalsy(); // should throw and not get here
			} catch (e) {
				if (e instanceof MarketplaceError) {
					const err: MarketplaceError = e;
					expect(err.code).toBe(4292);
				} else {
					throw e;
				}
			}
			await app.remove();
		});

		test("random() should return a new number [0, 1) for each invocation", () => {
			testRandomNumber(utils.random(), 0, 1);
		});

		test("random([...] should return a random item from the array", () => {
			const arr = [1, "2", "three", { key: "value" }, true];
			expect(arr).toContain(utils.random(arr));
		});

		test("random({...} should return a random item from the object", () => {
			const obj = {
				k1: "v1",
				k2: 2,
				k3: [1, 2, 3]
			};
			const [key, value] = utils.random(obj);
			expect((obj as any)[key]).toEqual(value);
		});

		test("random(Map{ ... } should return a random item from the map", () => {
			const map = new Map<string, any>([["k1", "v1"], ["k2", 2], ["k3", [1, 2, 3]]]);
			const [key, value] = utils.random(map);
			expect(map.get(key)).toEqual(value);
		});

		test("random(min, max) should return a new number [min, max) for each invocation", () => {
			testRandomNumber(utils.random(0, 10), 0, 10);

			testRandomNumber(utils.random(100, 1000), 100, 1000);
		});

		test("randomInteger(min, max) should return a new integer [min, max) for each invocation", () => {
			testRandomInteger(utils.randomInteger(0, 10), 0, 10);

			testRandomInteger(utils.randomInteger(100, 1000), 100, 1000);
		});
	});

	test("generateId(prefix) should return a random id string which starts with the passed prefix", () => {
		expect(utils.generateId(utils.IdPrefix.App).charAt(0)).toBe("A");
		expect(utils.generateId(utils.IdPrefix.User).charAt(0)).toBe("U");
		expect(utils.generateId(utils.IdPrefix.Offer).charAt(0)).toBe("O");
		expect(utils.generateId(utils.IdPrefix.Transaction).charAt(0)).toBe("T");
	});

	test("normalizeError should return a string representation", () => {
		expect(utils.normalizeError("error")).toEqual("error");
		expect(utils.normalizeError(new Error("another error"))).toEqual("another error");

		const o = new Date();
		expect(utils.normalizeError(o)).toEqual(o.toString());
	});

	test("remove duplicates", () => {
		expect(utils.removeDuplicates(["1", "2", "3", "3"]).sort()).toEqual(["1", "2", "3"].sort());
		expect(utils.removeDuplicates(["1000", "1", "1000", "1"]).sort()).toEqual(["1000", "1"].sort());
	});

	test("localCache expiration", async () => {
		localCache.clear();
		expect(localCache.get("blah")).toBeNull();
		localCache.set("blah", 1);
		expect(localCache.get("blah")).toEqual(1);
		localCache.set("blah", 2, moment.duration(1, "second"));
		expect(localCache.get("blah")).toEqual(2);
		await delay(1200);
		expect(localCache.get("blah")).toBeNull();
	});

	test("rate limit buckets day", () => {
		const window = moment.duration({ days: 1 });
		// date1 and date2 are in the same bucket
		const date1 = moment({ day: 18, month: 1, year: 2019, hour: 12, minute: 10 });
		const date2 = moment({ day: 18, month: 1, year: 2019, hour: 12, minute: 20 });
		// date3 is a bucket away from date1
		const date3 = moment({ day: 18, month: 1, year: 2019, hour: 12, minute: 30 });

		const r1 = new RateLimit("test", window, date1.valueOf());
		const r2 = new RateLimit("test", window, date2.valueOf());
		const r3 = new RateLimit("test", window, date3.valueOf());

		expect(r1.ttl).toEqual(moment.duration({ days: 2 }).asSeconds());
		expect(r1.bucketSize).toEqual(1440);
		expect(r1.currentTimestampSeconds).toEqual(r2.currentTimestampSeconds);
		expect(r1.currentTimestampSeconds).not.toEqual(r3.currentTimestampSeconds);

		expect(r1.getWindowKeys()).toEqual(r2.getWindowKeys());
		expect(r1.getWindowKeys().slice(0, 59)).toEqual(r3.getWindowKeys().slice(1));
	});
});
