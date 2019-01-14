import { app } from "../../public/app";
import { AuthToken as ApiAuthToken, userExists } from "../../public/services/users";
import { close as closeModels, init as initModels } from "../../models/index";
import { generateId, IdPrefix } from "../../utils/utils";

import * as helpers from "../helpers";
import { createApp, signJwt } from "../helpers";
import * as metrics from "../../metrics";
import { AuthToken, User } from "../../models/users";

import { Response } from "supertest";
import { WhitelistSignInData } from "../../public/routes/users";
import mock = require("supertest");

import { verify } from "../../public/jwt";
import { validateRegisterJWT } from "../../public/services/applications";
import { validateExternalOrderJWT } from "../../public/services/native_offers";
import { MissingFieldJWT, InvalidExternalOrderJwt } from "../../errors";

describe("api tests for /users", async () => {
	beforeAll(async done => {
		await initModels();
		helpers.patchDependencies();
		done();
	});

	afterAll(async () => {
		await closeModels();
		await metrics.destruct();
	});

	test("user register whitelist", async () => {
		const myApp = await helpers.createApp(generateId(IdPrefix.App));
		const signInData: WhitelistSignInData = {
			sign_in_type: "whitelist",
			api_key: myApp.apiKey,
			device_id: "my_device_id",
			user_id: "my_app_user_id",
			wallet_address: helpers.getKeyPair().public
		};

		const res = await mock(app)
			.post(`/v1/users/`)
			.send(signInData)
			.set("x-request-id", "123");

		const token: ApiAuthToken = res.body;
		expect(token.app_id).toEqual(myApp.id);
		const lastCreatedToken = (await AuthToken.findOne({ order: { createdDate: "DESC" } }))!;
		expect(token.token).toEqual(lastCreatedToken.id);
	});

	test("user profile test", async () => {
		const appId = generateId(IdPrefix.App);
		const user1 = await helpers.createUser({ appId });
		const user2 = await helpers.createUser({ appId });
		const token: AuthToken = (await AuthToken.findOne({ userId: user1.id }))!;

		await mock(app)
			.get(`/v1/users/non_user`)
			.set("x-request-id", "123")
			.set("Authorization", `Bearer ${ token.id }`)
			.expect(404, {});

		await mock(app)
			.get(`/v1/users/${ user1.appUserId }`)
			.set("x-request-id", "123")
			.set("Authorization", `Bearer ${ token.id }`)
			.expect(200, { stats: { earn_count: 0, spend_count: 0 } });

		await mock(app)
			.get(`/v1/users/${ user2.appUserId }`)
			.set("x-request-id", "123")
			.set("Authorization", `Bearer ${ token.id }`)
			.expect(200, {});

		await helpers.createOrders(user1.id); // creates 1 pending and 1 completed and 1 failed of earn and spend

		await mock(app)
			.get(`/v1/users/${ user1.appUserId }`)
			.set("x-request-id", "123")
			.set("Authorization", `Bearer ${ token.id }`)
			.expect(200)
			.expect((res: Response) => {
				if (res.body.stats.earn_count !== 2 || res.body.stats.spend_count !== 2) {
					throw new Error("unexpected body: " + JSON.stringify(res.body));
				}
			});

		// different appId
		const user3 = await helpers.createUser({ appId: generateId(IdPrefix.App) });
		await mock(app)
			.get(`/v1/users/${ user3.appUserId }`)
			.set("x-request-id", "123")
			.set("Authorization", `Bearer ${ token.id }`)
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
			.set("Authorization", `Bearer ${ token.id }`)
			.expect(204);
		let u1 = (await User.findOne({ id: user1.id }))!;
		expect(u1.walletAddress).toBe(newWalletAddress);
		await mock(app)
			.patch(`/v1/users`)
			.send({ wallet_address: badAddress })
			.set("content-type", "applications/json")
			.set("Authorization", `Bearer ${ token.id }`)
			.expect(400);
		u1 = (await User.findOne({ id: user1.id }))!;
		expect(u1.walletAddress).not.toBe(badAddress);
		expect(u1.walletAddress).toBe(newWalletAddress);

	});

	test("userExists", async () => {
		const user = await helpers.createUser();
		expect(await userExists(user.appId, user.appUserId)).toBeTruthy();
		expect(await userExists("another-app", user.appUserId)).toBeFalsy();
		expect(await userExists(user.appId, "another-user-id")).toBeFalsy();
	});

	test("testSign", async () => {
		const app = await createApp(generateId(IdPrefix.App));
		const payload = { test: "test" };
		const jwt = await signJwt(app.id, "subject", payload);
		const res = await verify<{ test: string }, "test_subject">(jwt);
		expect(res.payload.test).toEqual(payload.test);
	});

	test("testMalformedJWT", async () => {
		let jwt: string;
		let payload: object;

		const app = await createApp(generateId(IdPrefix.App));
		payload = {}; // no user_id
		jwt = await signJwt(app.id, "subject", payload);
		await expect(validateRegisterJWT(jwt)).rejects.toThrow();

		payload = { "0": "{", "1": "u", "2": "s", "3": "e", "4": "r", "5": "_", "6": "i", "7": "d", "8": "=", "9": "d", "10": "0", "11": "2", "12": "e", "13": "4", "14": "5", "15": "b", "16": "3", "17": "-", "18": "0", "19": "d", "20": "2", "21": "1", "22": "-", "23": "4", "24": "2", "25": "e", "26": "e", "27": "-", "28": "8", "29": "1", "30": "3", "31": "4", "32": "-", "33": "b", "34": "6", "35": "6", "36": "c", "37": "3", "38": "9", "39": "1", "40": "4", "41": "e", "42": "b", "43": "3", "44": "2", "45": "}" }; // jwt from failed request
		jwt = await signJwt(app.id, "subject", payload);
		await expect(validateRegisterJWT(jwt)).rejects.toThrow();

		payload = {};
		jwt = await signJwt(app.id, "", payload); // InvalidExternalOrderJwt, sub is not in earn/spend/pay_to_user
		await expect(validateExternalOrderJWT(jwt, "user_id")).rejects.toThrow();

		payload = {}; // no offer in earn/spend/pay_to_user JWTs
		jwt = await signJwt(app.id, "spend", payload);
		await expect(validateExternalOrderJWT(jwt, "user_id")).rejects.toThrow();
		payload = { offer: "offer" }; // no sender
		jwt = await signJwt(app.id, "spend", payload);
		await expect(validateExternalOrderJWT(jwt, "user_id")).rejects.toThrow();
		payload = { offer: "offer" }; // no recipient
		jwt = await signJwt(app.id, "earn", payload);
		await expect(validateExternalOrderJWT(jwt, "user_id")).rejects.toThrow();
		payload = { offer: "offer" }; // no sender, recipient
		jwt = await signJwt(app.id, "pay_to_user", payload);
		await expect(validateExternalOrderJWT(jwt, "user_id")).rejects.toThrow();
	});
});
