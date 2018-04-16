import * as path from "path";

import * as utils from "../../scripts/bin/utils";

describe("util functions", () => {
	test("path should return absolute path in the project", () => {
		expect(utils.path("my.file")).toEqual(path.resolve(__dirname, "../../", "my.file"));
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

		test("random() should return a new number [0, 1) for each invocation", () => {
			testRandomNumber(utils.random(), 0, 1);
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
