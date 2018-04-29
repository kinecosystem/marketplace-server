/**
 * This file populates a demo database for the sole sake of mocking data to populate our SDK client.
 * All the names of companies, products and KIN values are completely made up and are used for TESTING only.
 */
import { getConfig } from "./public/config"; // must be the first import
getConfig();

import * as fs from "fs";
import { Application, StringMap } from "./models/applications";
import { AppOffer, Offer } from "./models/offers";

import { init as initModels } from "./models";

async function createApp(appId: string, name: string, keyNames: string[], apiKey?: string) {
	const jwtPublicKeys: StringMap = {};

	for (const keyName of keyNames) {
		const keyValue = fs.readFileSync(`./examples/${appId}-${keyName}.pem`, "utf-8");
		jwtPublicKeys[keyName] = keyValue;
	}
	const app = Application.new({
		id: appId,
		name,
		jwtPublicKeys
	});
	if (apiKey) {
		app.apiKey = apiKey;  // when apiKey given, run-over generated value
	}
	await app.save();
	return app;
}

initModels().then(async () => {
	const app1 = await createApp("smpl", "Sample Application", ["default"], Application.SAMPLE_API_KEY);
	const app2 = await createApp("kik", "Kik Messenger", ["1"]);
	const apps = [app1, app2];
	const offers: Offer[] = await Offer.find(); // add all offers to both apps

	// adding all offers to all apps
	for (const offer of offers) {
		for (const app of apps) {
			const appOffer = AppOffer.new({
				appId: app.id,
				offerId: offer.id
			});
			await appOffer.save();
		}
	}

	console.log(`created application sample`, apps);
}).catch((error: Error) => {
	console.log("error: " + error.message + "\n" + error.stack);
});
