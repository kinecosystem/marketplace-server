/**
 * This script populates a demo database for the sole sake of mocking data to populate our SDK client.
 * All the names of companies, products and KIN values are completely made up and are used for TESTING only.
 */
import { getConfig } from "./public/config"; // must be the first import
import * as fs from "fs";
import { join } from "path";
import { Keypair } from "@kinecosystem/kin.js";

import { close as closeModels, init as initModels } from "./models";
import { PageType, Poll, Quiz, Tutorial } from "./public/services/offer_contents";
import { createEarn, createSpend, EarnOptions } from "./create_data/offers";
import { ContentType, Offer } from "./models/offers";
import { Application, ApplicationConfig, StringMap } from "./models/applications";
import { path } from "./utils";

import "./models/orders";
import "./models/users";

getConfig();

const STELLAR_ADDRESS = process.env.STELLAR_ADDRESS;  // address to use instead of the ones defined in the data
type AppDef = { app_id: string, name: string, api_key: string, jwt_public_keys: StringMap, config: ApplicationConfig };

async function createApp(appId: string, name: string, jwtPublicKeys: StringMap, apiKey: string, appConfig: ApplicationConfig, dryRun?: boolean): Promise<Application> {
	const existingApp = await Application.findOneById(appId);
	if (existingApp) {
		console.log(`existing app: ${appId}`);
		return existingApp;
	}
	const app = Application.new({
		name,
		jwtPublicKeys,
		id: appId,
		walletAddresses: getStellarAddresses(),
		config: appConfig
	});
	if (apiKey) {
		app.apiKey = apiKey;  // when apiKey given, run-over generated value
	}
	console.log("creating app: %s (id: %s)", name, appId, dryRun ? "(dry run)" : undefined);
	await !dryRun && app.save();
	return app;
}

export function readTitle(title: string): string {
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

async function parseSpend(data: string[][], appList: string[]) {
	const list = toMap(data);
	const results: Offer[] = [];
	for (const v of list) {
		results.push(await createSpend(
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
			appList));
	}
	return results;
}

async function parseEarn(data: string[][], contentType: ContentType, appList: string[], config: EarnOptions) {
	const list = toMap(data);

	const poll: Quiz | Poll | Tutorial = { pages: [] };
	let offer: Map<string, string> | undefined;

	const results: Offer[] = [];

	async function createEarnInner(v: Map<string, string>, poll: Quiz | Poll | Tutorial): Promise<Offer> {
		const offer = await createEarn(v.get("OfferName")!, STELLAR_ADDRESS || v.get("WalletAddress")!, v.get("Brand")!, v.get("Title")!, v.get("Description")!, v.get("Image")!, parseInt(v.get("Amount")!, 10), parseInt(v.get("CapTotal")!, 10), parseInt(v.get("CapPerUser")!, 10), v.get("OrderTitle")!, v.get("OrderDescription")!, contentType, poll, appList, config);
		return offer;
	}

	for (const v of list) {
		if (v.get("OfferName") !== "") {
			if (offer) {
				results.push(await createEarnInner(offer, poll));
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
				description: v.get("PollDescription") || v.get("PollFooterHtml")!
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
		results.push(await createEarnInner(offer, poll));
	}
	return results;
}

function getStellarAddresses() {
	if (STELLAR_ADDRESS) {
		return { recipient: STELLAR_ADDRESS, sender: STELLAR_ADDRESS };
	} else {
		const address = Keypair.random().publicKey();
		return { recipient: address, sender: address };
	}
}

type Config = {
	apps_dir: string | null;
	offers_dir: string | null;
	app_list: string[];
	no_update: boolean | null;
	dry_run: boolean | null;
	require_update_confirm: boolean | null
};

function initArgsParser(): Config {
	const ArgumentParser = require("argparse").ArgumentParser;
	const parser = new ArgumentParser({
		version: "2.0.0",
		addHelp: true,
		description: "DB initializer script for Apps and Offers. Apps configuration come as JSON files and offers as CSV files.",
		argumentDefault: {}
	});
	parser.addArgument(["--apps-dir"], {
		help: "Location (directory) of app config json files"
	});
	parser.addArgument(["--offers-dir"], {
		help: "Location (directory) of offers csv files"
	});
	parser.addArgument(["--app-list"], {
		help: "Comma separated list of apps (i.e smpl, swel, kik, test, p365...) to have the earn offers added to (ALL, in caps, to add to all apps)",
		// choices: ["smpl", "swel", "kik", "test", "p365", "*"]
	});
	parser.addArgument(["--no-update"], {
		help: "Don't update existing earn offers, only create new ones.",
		action: "storeTrue"
	});
	parser.addArgument(["--dry-run"], {
		help: "Process the data but don't touch the DB",
		action: "storeTrue"
	});

	// parser.addArgument(["-c", "--require-update-confirm"], {
	// 	help: "Ask for confirmation before updating earn offers",
	// 	action: "storeTrue"
	// });
	const parsed = parser.parseArgs();
	parsed.app_list = parsed.app_list ? parsed.app_list.split(" ") : [];
	return parsed as Config;
}

function confirmPrompt(message) {
	const readline = require("readline");
	const prompt = readline.createInterface(process.stdin, process.stdout);
	return new Promise(resolve => {
		prompt.question(message + "\n", answer => {
			prompt.close();
			resolve(answer);
		});
	});
}

initModels(process.env.CREATE_DB === "TRUE").then(async () => {
	const config = initArgsParser();
	console.log(config);
	// const appsDir = process.argv[2];
	// const offersDir = process.argv[3];
	// let appList: string[] = process.argv[4] ? process.argv[4].split(",") : [];
	const appsDir = config.apps_dir;
	if (appsDir) {
		for (const filename of fs.readdirSync(path(appsDir))) {
			if (!filename.endsWith(".json")) {
				console.info(`skipping non json file ${filename}`);
				continue;
			}
			const data: AppDef = JSON.parse(fs.readFileSync(path(join(appsDir, filename))).toString());
			await createApp(data.app_id, data.name, data.jwt_public_keys, data.api_key, data.config, config.dry_run);
		}
	}
	const offersDir = config.offers_dir;
	if (offersDir) {
		let appList = config.app_list;
		if (!appList || !appList.length) {
			throw Error("Application list must be given. See help (--help)");
		}
		if (appList[0] === "ALL") {
			appList = (await Application.find({ select: ["id"] })).map(app => app.id);
		}

		// sanity on app ids
		await Promise.all(appList.map(async appId => {
			if (!await Application.findOneById(appId)) {
				throw Error(`Application not found ${appId}`);
			}
		}));

		// create offers from csv
		const parseCsv = require("csv-parse/lib/sync");
		const createOfferOptions: EarnOptions = {
			doNotUpdateExiting: config.no_update!,
			dryRun: config.dry_run!,
			confirmUpdate: config.require_update_confirm!
		};
		for (const filename of fs.readdirSync(path(offersDir))) {
			const offersCsv = fs.readFileSync(path(join(offersDir, filename)));
			const parsed = parseCsv(offersCsv);

			const title = readTitle(parsed[0][0]);
			const contentType = parsed[0][0].split(/ +/, 2)[1].toLowerCase() as ContentType;
			let results = [];
			if (title === "Spend") {
				results = await parseSpend(parsed, appList);
				console.log(`created spend:${contentType} offers`);
			} else if (title === "Earn") {
				results = await parseEarn(parsed, contentType, appList, createOfferOptions);
				console.log(`created earn:${contentType} offers`);
			} else {
				throw new Error("Failed to parse " + parsed[0][0]);
			}
		}
	}
	await closeModels();
	console.log(`done.`);
}).catch(async (error: Error) => {
	console.log("error: " + error.message + "\n" + error.stack);
	await closeModels();
	console.log(`done.`);
});
