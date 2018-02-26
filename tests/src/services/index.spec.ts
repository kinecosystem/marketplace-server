import mock = require("supertest");

import { app } from "../../../scripts/bin/app";

describe("general api checks", async () => {
	test("unknown api endpoints should return 404", done => {
		mock(app)
			.get("/v1/no_such_page")
			.expect(404)
			.then(() => {
				done();
			});
	});
});
