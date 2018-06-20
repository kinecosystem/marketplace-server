/**
 * This file populates a demo database for the sole sake of mocking data to populate our SDK client.
 * All the names of companies, products and KIN values are completely made up and are used for TESTING only.
 */
import { getConfig } from "./public/config"; // must be the first import
getConfig();

import * as fs from "fs";
import * as StellarSdk from "stellar-sdk";

import { init as initModels, close as closeModels } from "./models";
import { PageType, Poll, Quiz, Tutorial } from "./public/services/offer_contents";
import { createEarn, createSpend } from "./create_data/offers";
import { ContentType, Offer } from "./models/offers";
import { StringMap, Application } from "./models/applications";
import "./models/orders";
import "./models/users";

const STELLAR_ADDRESS = process.env.STELLAR_ADDRESS;  // address to use instead of the ones defined in the data

async function createApp(appId: string, name: string, keyNames: string[], apiKey?: string) {
	const jwtPublicKeys: StringMap = {};

	for (const keyName of keyNames) {
		const keyValue = fs.readFileSync(`./examples/${appId}-${keyName}.pem`, "utf-8");
		jwtPublicKeys[keyName] = keyValue;
	}
	const app = Application.new({
		name,
		jwtPublicKeys,
		id: appId,
		walletAddresses: getStellarAddresses()
	});
	if (apiKey) {
		app.apiKey = apiKey;  // when apiKey given, run-over generated value
	}
	await app.save();
	return app;
}

function readTitle(title: string): string {
	// read until first space
	return title.split(/ +/, 1)[0];
}

function toMap(data: string[][]): Array<Map<string, string>> {
	const list = [] as Array<Map<string, string>>;
	const titles = data[1].map(title => readTitle(title));
	for (let i = 2; i < data.length; i++) {
		const map = new Map<string, string>();
		for (let j = 0; j < titles.length; j++) {
			map.set(titles[j], data[i][j]);
		}
		list.push(map);
	}

	return list;
}

async function getAllApps(): Promise<Application[]> {
	return await Application.createQueryBuilder("app")
		.leftJoinAndSelect("app.offers", "offer")
		.getMany();
}

async function parseSpend(data: string[][]) {
	const list = toMap(data);
	const offers: Offer[] = [];
	for (const v of list) {
		const offer = await createSpend(
			v.get("OfferName")!,
			STELLAR_ADDRESS || v.get("WalletAddress")!,
			v.get("Brand")!,
			v.get("Title")!,
			v.get("Description")!,
			v.get("Image")!,
			parseInt(v.get("Amount")!, 10),
			parseInt(v.get("CapTotal")!, 10),
			parseInt(v.get("CapPerUser")!, 10),
			v.get("OrderTitle")!,
			v.get("OrderDescription")!,
			v.get("OrderCallToAction")!,
			v.get("CouponImage")!,
			v.get("CouponTitle")!,
			v.get("CouponDescription")!,
			v.get("CouponConfirmImage")!,
			v.get("CouponConfirmTitle")!,
			v.get("CouponConfirmSubtitle")!,
			v.get("OrderContentImage")!,
			v.get("OrderContentTitle")!,
			v.get("OrderContentSubtitle")!,
			v.get("OrderContentHyperLink")!,
			v.get("CouponCodes")!.split(/\s+/),
		);
		offers.push(offer);
	}

	for (const app of await getAllApps()) {
		app.offers = app.offers.concat(offers);
		await app.save();
	}
}

async function parseEarn(data: string[][], contentType: ContentType) {
	const list = toMap(data);

	const poll: Quiz | Poll | Tutorial = { pages: [] };
	let offer: Map<string, string> | undefined;

	async function createEarnInner(v: Map<string, string>, poll: Quiz | Poll | Tutorial): Promise<Offer> {
		const offer = await createEarn(
			v.get("OfferName")!,
			STELLAR_ADDRESS || v.get("WalletAddress")!,
			v.get("Brand")!,
			v.get("Title")!,
			v.get("Description")!,
			v.get("Image")!,
			parseInt(v.get("Amount")!, 10),
			parseInt(v.get("CapTotal")!, 10),
			parseInt(v.get("CapPerUser")!, 10),
			v.get("OrderTitle")!,
			v.get("OrderDescription")!,
			contentType,
			poll);
		return offer;
	}

	const offers: Offer[] = [];
	for (const v of list) {
		if (v.get("OfferName") !== "") {
			if (offer) {
				offers.push(await createEarnInner(offer, poll));
			}
			offer = v;
			poll.pages = [];
		}

		// continue from last row
		if (v.get("PollPageType")! === "FullPageMultiChoice") {
			(poll as Poll).pages.push({
				type: PageType.FullPageMultiChoice,
				title: v.get("PollTitle")!,
				description: v.get("PollDescription")!,
				question: {
					id: v.get("PollQuestionId")!,
					answers: [
						v.get("PollAnswer1")!,
						v.get("PollAnswer2")!,
						v.get("PollAnswer3")!,
						v.get("PollAnswer4")!,
					],
				},
			});
		} else if (v.get("PollPageType")! === "TimedFullPageMultiChoice") {
			(poll as Quiz).pages.push({
				type: PageType.TimedFullPageMultiChoice,
				title: v.get("PollTitle")!,
				description: v.get("PollDescription")!,
				question: {
					id: v.get("PollQuestionId")!,
					answers: [
						v.get("PollAnswer1")!,
						v.get("PollAnswer2")!,
						v.get("PollAnswer3")!,
						v.get("PollAnswer4")!,
					],
				},
				rightAnswer: parseInt(v.get("rightAnswer")!, 10),
				amount: parseInt(v.get("amount")!, 10),
			});
		} else if (v.get("PollPageType")! === "EarnThankYou") {
			(poll as Poll).pages.push({
				type: PageType.EarnThankYou,
				description: v.get("PollDescription")!
			});
		} else if (v.get("PollPageType")! === "SuccessBasedThankYou") {
			(poll as Quiz).pages.push({
				type: PageType.SuccessBasedThankYou,
				description: v.get("PollDescription")!
			});
		} else if (v.get("PollPageType")! === "ImageAndText") {
			(poll as Tutorial).pages.push({
				type: PageType.ImageAndText,
				image: v.get("PollImage")!,
				title: v.get("PollTitle")!,
				bodyHtml: v.get("PollBodyHtml")!,
				footerHtml: v.get("PollFooterHtml")!,
				buttonText: v.get("PollButtonText")!
			});
		} else {
			console.log(`poll type unknown: ${v.get("PollPageType")}`);
		}
	}

	if (offer) {
		offers.push(await createEarnInner(offer, poll));
	}

	for (const app of await getAllApps()) {
		app.offers = app.offers.concat(offers);
		await app.save();
	}
}

function getStellarAddresses() {
	if (STELLAR_ADDRESS) {
		return { earn: STELLAR_ADDRESS, spend: STELLAR_ADDRESS };
	} else {
		const address = StellarSdk.Keypair.random().publicKey();
		return { earn: address, spend: address };
	}
}

initModels().then(async () => {
	// create apps
	const app1 = await createApp("smpl", "Sample Application", ["default", "1"], Application.SAMPLE_API_KEY);
	const app2 = await createApp("kik", "Kik Messenger", ["1"]);
	const app3 = await createApp("test", "Test App", ["es256_0", "rs512_0"]);

	const apps = [app1, app2, app3];
	const offers: Offer[] = await Offer.find(); // add all offers to both apps

	// adding all offers to all apps
	for (const app of apps) {
		app.offers = offers;
		await app.save();
		console.log(`created application`, app.id);
	}

	// create offers from csv
	const parseCsv = require("csv-parse/lib/sync");

	for (let i = 1; i <= 4; i++) {
		const spend = fs.readFileSync(`./data/${i}.csv`);
		const parsed = parseCsv(spend);
		const title = readTitle(parsed[0][0]);
		const contentType = parsed[0][0].split(/ +/, 2)[1].toLowerCase() as ContentType;
		if (title === "Spend") {
			await parseSpend(parsed);
			console.log(`created spend:${contentType} offers`);
		} else if (title === "Earn") {
			await parseEarn(parsed, contentType);
			console.log(`created earn:${contentType} offers`);
		} else {
			throw new Error("Failed to parse " + parsed[0][0]);
		}
	}
	await closeModels();
	console.log(`done.`);
}).catch(async (error: Error) => {
	console.log("error: " + error.message + "\n" + error.stack);
	await closeModels();
	console.log(`done.`);
});
