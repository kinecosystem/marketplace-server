import * as expect from "expect";

import { app } from "../../../scripts/bin/public/app";
import * as payment from "../../../scripts/bin/public/services/payment";
import { userExists } from "../../../scripts/bin/public/services/users";
import { close as closeModels, init as initModels } from "../../../scripts/bin/models/index";
import { generateId, IdPrefix } from "../../../scripts/bin/utils";

import * as helpers from "../helpers";
import * as metrics from "../../../scripts/bin/metrics";
import { AuthToken, User } from "../../../scripts/bin/models/users";
import { Response } from "supertest";
import mock = require("supertest");

describe("api tests for /users", async () => {
	beforeAll(async done => {
		await initModels();
		(payment.getBlockchainConfig as any) = () => 1; // XXX use a patching library
		done();
	});

	afterAll(async () => {
		await closeModels();
		await metrics.destruct();
	});

	test("user profile test", async () => {
		const appId = generateId(IdPrefix.App);
		const user1 = await helpers.createUser({ appId });
		const user2 = await helpers.createUser({ appId });
		const token: AuthToken = (await AuthToken.findOne({ userId: user1.id }))!;

		await mock(app)
			.get(`/v1/users/non_user`)
			.set("x-request-id", "123")
			.set("Authorization", `Bearer ${token.id}`)
			.expect(404, {});

		await mock(app)
			.get(`/v1/users/${user1.appUserId}`)
			.set("x-request-id", "123")
			.set("Authorization", `Bearer ${token.id}`)
			.expect(200, { stats: { earn_count: 0, spend_count: 0 } });

		await mock(app)
			.get(`/v1/users/${user2.appUserId}`)
			.set("x-request-id", "123")
			.set("Authorization", `Bearer ${token.id}`)
			.expect(200, {});

		await helpers.createOrders(user1.id); // creates 1 pending and 1 completed and 1 failed of earn and spend

		await mock(app)
			.get(`/v1/users/${user1.appUserId}`)
			.set("x-request-id", "123")
			.set("Authorization", `Bearer ${token.id}`)
			.expect(200)
			.expect((res: Response) => {
				if (res.body.stats.earn_count !== 2 || res.body.stats.spend_count !== 2) {
					throw new Error("unexpected body: " + JSON.stringify(res.body));
				}
			});

		// different appId
		const user3 = await helpers.createUser({ appId: generateId(IdPrefix.App) });
		await mock(app)
			.get(`/v1/users/${user3.appUserId}`)
			.set("x-request-id", "123")
			.set("Authorization", `Bearer ${token.id}`)
			.expect(404);
	});

	test("updateUser", async () => {
		const appId = generateId(IdPrefix.App);
		const user1 = await helpers.createUser({ appId });
		const newWalletAddress = "new_address_must_be_56_characters____bla___bla___bla____";
		const badAddress = "new_address_not_56_chars";
		const token: AuthToken = (await AuthToken.findOne({ userId: user1.id }))!;

		await mock(app)
			.patch(`/v1/users`)
			.send({ wallet_address: newWalletAddress })
			.set("content-type", "application/json")
			.set("Authorization", `Bearer ${token.id}`)
			.expect(204);
		let u1 = (await User.findOne( { id: user1.id }))!;
		expect(u1.walletAddress).toBe(newWalletAddress);
		await mock(app)
			.patch(`/v1/users`)
			.send({ wallet_address: badAddress })
			.set("content-type", "applications/json")
			.set("Authorization", `Bearer ${token.id}`)
			.expect(400);
		u1 = (await User.findOne( { id: user1.id }))!;
		expect(u1.walletAddress).not.toBe(badAddress);
		expect(u1.walletAddress).toBe(newWalletAddress);

	});

	test("userExists", async () => {
		const user = await helpers.createUser();
		expect(await userExists(user.appId, user.appUserId)).toBeTruthy();
		expect(await userExists("another-app", user.appUserId)).toBeFalsy();
		expect(await userExists(user.appId, "another-user-id")).toBeFalsy();
	});
});
