import * as expect from "expect";
import mock = require("supertest");

import { app } from "../../../scripts/bin/public/app";
import * as payment from "../../../scripts/bin/public/services/payment";
import { userExists } from "../../../scripts/bin/public/services/users";
import { init as initModels, close as closeModels } from "../../../scripts/bin/models/index";
import { generateId, IdPrefix } from "../../../scripts/bin/utils";

import * as helpers from "../helpers";
import * as metrics from "../../../scripts/bin/metrics";
import { AuthToken } from "../../../scripts/bin/models/users";

describe("api tests for /users", async () => {
	beforeAll(async done => {
		await initModels();
		(payment.getBlockchainConfig as any) = () => 1; // XXX use a patching library
		done();
	});

	afterAll(async () => {
		await closeModels();
		metrics.destruct();
	});

	test("return a user with 200", async () => {
		const user1 = await helpers.createUser({ appId: generateId(IdPrefix.App) });
		const user2 = await helpers.createUser({ appId: generateId(IdPrefix.App) });
		const token: AuthToken = await AuthToken.findOne({ userId: user1.id });

		console.log('token', token);

		await mock(app)
			.get(`/v1/users/non_user`)
			.set("x-request-id", "123")
			.set("Authorization", `Bearer ${token.id}`)
			.expect(404);

		await mock(app)
			.get(`/v1/users/${user1.appUserId}`)
			.set("x-request-id", "123")
			.set("Authorization", `Bearer ${token.id}`)
			.expect(200);

		await mock(app)
			.get(`/v1/users/${user2.appUserId}`)
			.set("x-request-id", "123")
			.set("Authorization", `Bearer ${token.id}`)
			.expect(200);
	});

	test("userExists", async () => {
		const user = await helpers.createUser();
		expect(await userExists(user.appId, user.appUserId)).toBeTruthy();
		expect(await userExists("another-app", user.appUserId)).toBeFalsy();
		expect(await userExists(user.appId, "another-user-id")).toBeFalsy();
	});
});
