import mock = require("supertest");

import { app as webApp } from "../../public/app";
import * as metrics from "../../metrics";
import { signJwt } from "../helpers";
import { validateExternalOrderJWT } from "../../public/services/native_offers";
import { InvalidExternalOrderJwt, MissingFieldJWT } from "../../errors";
import { close as closeModels, init as initModels } from "../../models";
import { getAppBlockchainVersion as getAppBlockchainVersionService } from "../../public/services/applications";
import * as helpers from "../helpers";
import { localCache } from "../../utils/cache";
import { initLogger } from "../../logging";
import { generateId, IdPrefix } from "../../utils/utils";
import { validateMigrationListJWT } from "../../utils/migration";
import { GradualMigrationUser } from "../../models/users";

describe("general api checks", async () => {
	beforeEach(async done => {
		initLogger();
		await initModels();
		helpers.patchDependencies();
		localCache.clear();
		done();
	});

	afterEach(async () => {
		await closeModels();
		await metrics.destruct();
	});

	test("unknown api endpoints should return 404", async () => {
		await mock(webApp)
			.get("/v1/no_such_page")
			.expect(404);
	});

	test("app blockchain version should be 2 | 3", async () => {
		const application = await helpers.createApp(generateId(IdPrefix.App));
		const blockchainVersion = await getAppBlockchainVersionService(application.id);
		expect(blockchainVersion === application.config.blockchain_version && (blockchainVersion === "2" || blockchainVersion === "3")); // checking blochain version from getAppBlockchainVersionService equals to application.config and remains 2 || 3

		await mock(webApp)
			.get(`/v2/applications/${ application.id }/blockchain_version/`)
			.then(response => {
				expect(response.status === 200);
				expect(response.body === application.config.blockchain_version && (response.body === "2" || response.body === "3"));
			});
	});

	test("External Order JWT validation throws when amount is not a number", async () => {
		const app = await helpers.createApp(generateId(IdPrefix.App));
		const user = await helpers.createUser({ appId: app.id });
		const jwt = await signJwt(app.id, "pay_to_user", {
			offer: {
				offer_id: "offer.id",
				amount: "23",
			},
			sender: {
				user_id: "some_user_id",
				device_id: "some_device_id",
				title: "sent moneys",
				description: "money sent to test p2p",
			},
			recipient: {
				user_id: "recipientId",
				title: "get moneys",
				description: "money received from p2p testing"
			},
		});
		await expect(validateExternalOrderJWT(jwt, user, "some_deviceId")).rejects.toThrow(InvalidExternalOrderJwt("amount field must be a number"));
	});

	test("addGradualMigrationUsers", async () => {
		const app = await helpers.createApp(generateId(IdPrefix.App));
		const users = [
			await helpers.createUser({ appId: app.id }),
			await helpers.createUser({ appId: app.id }),
			await helpers.createUser({ appId: app.id }),
			await helpers.createUser({ appId: app.id }),
		];
		const userIds = users.map(u => u.appUserId);
		const jwt = await signJwt(app.id, "migrate_users", {
			user_ids: userIds,
		});
		expect(await validateMigrationListJWT(jwt, app.id)).toEqual(userIds);

		await mock(webApp)
			.post(`/v2/applications/${ app.id }/migration/users`)
			.send({ jwt })
			.expect(204);
		const dbUsers = await GradualMigrationUser.findByIds(users.map(u => u.id));
		expect(dbUsers.length).toEqual(users.length);
	});

	test("addGradualMigrationUsers missing user_ids", async () => {
		const app = await helpers.createApp(generateId(IdPrefix.App));
		const users = [
			await helpers.createUser({ appId: app.id }),
			await helpers.createUser({ appId: app.id }),
			await helpers.createUser({ appId: app.id }),
			await helpers.createUser({ appId: app.id }),
		];
		const jwt = await signJwt(app.id, "migrate_users", {
			blah: users.map(u => u.appUserId),
		});
		await expect(validateMigrationListJWT(jwt, app.id)).rejects.toThrow(MissingFieldJWT("user_ids"));
	});
});
