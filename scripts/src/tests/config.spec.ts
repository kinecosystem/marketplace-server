import { init as initConfig, getConfig, Config } from "../config";

type FakePropertyOnConfig = Config & {
	cache_ttl: {
		nonexistent_prop: number;
	}
};

describe("Config", () => {
	test("Check cache ttl returns default value on non0-existent properties", () => {
		initConfig("../../config/public.default.json");
		const config: FakePropertyOnConfig = getConfig();
		expect(config.cache_ttl.nonexistent_prop).toBe(config.cache_ttl.default);
	});
});
