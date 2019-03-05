import mock = require("supertest");

import { app } from "../../public/app";
import * as metrics from "../../metrics";
import { signJwt } from "../helpers";
import { validateExternalOrderJWT } from "../../public/services/native_offers";
import { InvalidExternalOrderJwt } from "../../errors";
import { close as closeModels, init as initModels } from "../../models";
import * as helpers from "../helpers";
import { localCache } from "../../utils/cache";
import { initLogger } from "../../logging";
import { generateId, IdPrefix } from "../../utils/utils";

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
		await mock(app)
			.get("/v1/no_such_page")
			.expect(404);
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
});
