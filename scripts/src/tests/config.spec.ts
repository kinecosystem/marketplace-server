import { init as initConfig, getConfig, Config } from "../config";
import * as helpers from "./helpers";
import { generateId } from "../utils/utils";
import { initLogger } from "../logging";
import { close as closeModels, init as initModels } from "../models";
import { localCache } from "../utils/cache";
import * as metrics from "../metrics";

type FakePropertyOnConfig = Config & {
	cache_ttl: {
		nonexistent_prop: number;
	}
};

describe("Config", () => {
	beforeEach(async done => {
		initLogger();
		await initModels();
		await helpers.clearDatabase();
		await helpers.createOffers();
		helpers.patchDependencies();

		localCache.clear();
		done();
	});

	afterEach(async done => {
		await closeModels();
		await metrics.destruct();
		done();
	});

	test("Check cache ttl returns default value on non0-existent properties", () => {
		initConfig("../../config/public.default.json");
		const config: FakePropertyOnConfig = getConfig();
		expect(config.cache_ttl.nonexistent_prop).toBe(config.cache_ttl.default);
	});

	test("shouldApplyGradualMigration", async () => {
		const app = await helpers.createApp(generateId());
		expect(app.shouldApplyGradualMigration()).toBeFalsy();
		app.config.gradual_migration_date = "2019-05-05T10:10:10Z";
		expect(app.shouldApplyGradualMigration()).toBeTruthy();
		expect(app.shouldApplyGradualMigration(new Date("2019-06-05T10:10:10Z"))).toBeTruthy();
		expect(app.shouldApplyGradualMigration(new Date("2019-04-05T10:10:10Z"))).toBeFalsy(); 
	});
});
