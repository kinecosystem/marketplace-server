/**
 * This file populates a demo database for the sole sake of mocking data to populate our SDK client.
 * All the names of companies, products and KIN values are completely made up and are used for TESTING only.
 */
import { getConfig } from "./public/config"; // must be the first import
getConfig();

import * as fs from "fs";
import { Application } from "./models/applications";
import { AppOffer, Offer } from "./models/offers";

import { init as initModels } from "./models";

async function createApp(appId: string, apiKey: string, name: string) {
	const jwtPublic = fs.readFileSync("./examples/jwt_public_key.pem", "utf-8");
	const jwtPrivate = fs.readFileSync("./examples/jwt_private_key.pem", "utf-8");

	const app = Application.new({
		id: appId,
		name,
		jwtPublicKeys: { 1: jwtPublic }
	});
	app.apiKey = apiKey;  // XXX temporary run-over apiKey for testing
	await app.save();
	return app;
}

initModels().then(async () => {
	const app1 = await createApp("kik", Application.KIK_API_KEY, "Kik Messenger");
	const app2 = await createApp("smpl", Application.SAMPLE_API_KEY, "Sample Application");

	const offers: Offer[] = await Offer.find(); // add all offers to both apps

	for (const offer of offers) {
		for (const app of [app1, app2]) {
			const appOffer = AppOffer.new({
				appId: app.id,
				offerId: offer.id
			});
			await appOffer.save();
		}
	}

	console.log(`created application kik ${app1}`);
	console.log(`created application sample ${app2}`);
}).catch((error: Error) => {
	console.log("error: " + error.message + "\n" + error.stack);
});
