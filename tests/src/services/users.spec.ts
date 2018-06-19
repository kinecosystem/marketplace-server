import mock = require("supertest");

import { app } from "../../../scripts/bin/public/app";
import { init as initModels, close as closeModels } from "../../../scripts/bin/models/index";
import * as payment from "../../../scripts/bin/public/services/payment";

describe("api tests for /users", async () => {
	beforeAll(async done => {
		await initModels();
		(payment.getBlockchainConfig as any) = () => 1; // XXX use a patching library
		done();
	});

	afterAll(async () => {
		await closeModels();
	});

	test("return a user with 200", async () => {
		await mock(app)
			.get("/v1/users?id=1234")
			.set("x-request-id", "123")
			.expect(404);
	});
});
