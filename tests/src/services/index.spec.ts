import mock = require("supertest");

import { app } from "../../../scripts/src/public/app";
import * as metrics from "../../../scripts/src/metrics";

describe("general api checks", async () => {
	test("unknown api endpoints should return 404", async () => {
		await mock(app)
			.get("/v1/no_such_page")
			.expect(404);
	});
	afterAll(async () => {
		await metrics.destruct();
	});

});
