import { init as initConfig } from "../../../scripts/bin/config"; // must be the first import
initConfig("config/test.json");

import mock = require("supertest");

import { init as initModels } from "../../../scripts/bin/models/index";
import { app } from "../../../scripts/bin/public/app";

describe("api tests for /users", async () => {
	beforeAll(async () => {
		await initModels();
	});

	test("return a user with 200", async () => {
		await mock(app)
			.get("/v1/users?id=1234")
			.set("x-request-id", "123")
			.expect(200);
	});
});
