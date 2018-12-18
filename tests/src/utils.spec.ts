import * as path from "path";
import * as moment from "moment";

import * as utils from "../../scripts/bin/utils/utils";
import { Application } from "../../scripts/bin/models/applications";

import { path as _path } from "../../scripts/bin/utils/path";
import * as metrics from "../../scripts/bin/metrics";
import * as helpers from "./helpers";
import { LimitConfig } from "../../scripts/bin/config";
import { initLogger } from "../../scripts/bin/logging";
import { MarketplaceError } from "../../scripts/bin/errors";
import { close as closeModels, init as initModels } from "../../scripts/bin/models/index";
import { rateLimitAppEarn } from "../../scripts/bin/utils/rate_limit";

describe("util functions", () => {
	test("path should return absolute path in the project", () => {
		expect(_path("my.file")).toEqual(path.resolve(__dirname, "../../", "my.file"));
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
			const app: Application = await helpers.createApp(utils.generateId(), limits);
			for (let i = 0; i < 3; i++) {
				await rateLimitAppEarn(app.id, app.config.limits.minute_total_earn, moment.duration({ minutes: 1 }), 100);
			}

			try {
				await rateLimitAppEarn(app.id, app.config.limits.minute_total_earn, moment.duration({ minutes: 1 }), 100);
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
});
