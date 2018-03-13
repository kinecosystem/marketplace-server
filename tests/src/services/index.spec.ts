import mock = require("supertest");

import { app } from "../../../scripts/bin/app";

describe("general api checks", async () => {
	test("unknown api endpoints should return 404", async () => {
		await mock(app)
		.get("/v1/no_such_page")
		.expect(404);
	});
});
