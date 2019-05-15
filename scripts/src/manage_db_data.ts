/**
 * This script populates a demo database for the sole sake of mocking data to populate our SDK client.
 * All the names of companies, products and KIN values are completely made up and are used for TESTING only.
 */
import { getConfig } from "./public/config"; // must be the first import
import * as fs from "fs";
import { join } from "path";
import { Keypair } from "@kinecosystem/kin.js";

import { close as closeDbConnection, init as initModels } from "./models";
import { PageType, Poll, Quiz, Tutorial } from "./public/services/offer_contents";
import { createEarn, createSpend, EarnOptions } from "./create_data/offers";
import { ContentType, Offer, SdkVersionRule } from "./models/offers";
import { Application, ApplicationConfig, StringMap } from "./models/applications";
import { path } from "./utils/path";

import "./models/orders";
import "./models/users";
import * as translations from "./admin/translations";
import * as adaptTranslations from "./adapt_translation_csv";

getConfig();  // App Config

type ScriptConfig = {
	apps_dir: string | null;
	offers_dir: string | null;
	app_list: string[];
	update_earn_thumbnails: boolean;
	no_update: boolean;
	only_update: boolean;
	dry_run: boolean;
	require_update_confirm: boolean;
	create_db: boolean;
	trans_file: string | null;
	trans_lang: string | null;
	rules_dir: string | null;
};
let scriptConfig: ScriptConfig;

const STELLAR_ADDRESS = process.env.STELLAR_ADDRESS;  // address to use instead of the ones defined in the data
type AppDef = { app_id: string, name: string, api_key: string, jwt_public_keys: StringMap, config: ApplicationConfig };

async function createApp(appId: string, name: string, jwtPublicKeys: StringMap, apiKey: string, appConfig: ApplicationConfig, dryRun?: boolean): Promise<Application> {
	const existingApp = await Application.findOneById(appId);
	if (existingApp) {
		console.log(`existing app: ${ appId }`);
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
	console.log("creating app: %s (id: %s)", name, appId, dryRun ? "(dry run)" : "");
	!dryRun && await app.save();
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

	const results: Array<Offer | null> = [];

	async function createEarnInner(v: Map<string, string>, poll: Quiz | Poll | Tutorial): Promise<Offer | null> {
		return await createEarn(
			v.get("OfferName")!,
			STELLAR_ADDRESS || v.get("WalletAddress")!,
			v.get("Brand")!, v.get("Title")!,
			v.get("Description")!,
			v.get("Image")!,
			parseInt(v.get("Amount")!, 10),
			parseInt(v.get("CapTotal")!, 10),
			parseInt(v.get("CapPerUser")!, 10),
			v.get("OrderTitle")!,
			v.get("OrderDescription")!, contentType, poll, appList, config);
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
				description: "",
				rewardText: v.get("PollRewardText")!,
				rewardValue: v.get("PollRewardValue")!,
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
				rewardText: v.get("PollRewardText")!,
				rewardValue: v.get("PollRewardValue")!,
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
				rewardText: v.get("PollRewardText")!,
				rewardValue: v.get("PollRewardValue")!,
				buttonText: v.get("PollButtonText")!
			});
		} else {
			console.log(`poll type unknown: ${ v.get("PollPageType") }`);
		}
	}
	if (offer) {
		results.push(await createEarnInner(offer, poll));
	}
	return results.filter(v => !!v);
}

function getStellarAddresses() {
	if (STELLAR_ADDRESS) {
		return { recipient: STELLAR_ADDRESS, sender: STELLAR_ADDRESS };
	} else {
		const address = Keypair.random().publicKey();
		return { recipient: address, sender: address };
	}
}

function initArgsParser(): ScriptConfig {
	const ArgumentParser = require("argparse").ArgumentParser;
	const parser = new ArgumentParser({
		version: "2.0.0",
		addHelp: true,
		description: "DB initializer script for Apps and Offers. Apps configuration come as JSON files and offers as CSV files.",
		argumentDefault: undefined  // Normalizing defaults, otherwise they're set to {}
	});
	parser.addArgument(["--apps-dir"], {
		help: "Location (directory) of app config json files"
	});
	parser.addArgument(["--offers-dir"], {
		help: "Location (directory) of offers csv files"
	});
	parser.addArgument(["--app-list"], {
		help: "Comma separated list of apps (i.e smpl, test...) to have the earn offers added to (ALL, in caps, to add to all apps)",
	});
	parser.addArgument(["--no-update"], {
		help: "Don't update existing earn offers, only create new ones.",
		action: "storeTrue"
	});
	parser.addArgument(["--only-update"], {
		help: "Don't create new earn offers, only update existing ones.",
		action: "storeTrue"
	});
	parser.addArgument(["--update-earn-thumbnails"], {
		help: "Update only earn offers thumbnail image (that is offer.meta.image)",
		action: "storeTrue"
	});
	parser.addArgument(["-d", "--dry-run"], {
		help: "Process the data but don't touch the DB (doesn't apply to spend offers)",
		action: "storeTrue"
	});
	parser.addArgument(["-c", "--create-db"], {
		help: `Create tables/schemes if needed. ${ "\x1b[41m" /* red */ }USUALLY SHOULD NOT BE RUN IN PRODUCTION${ "\x1b[0m" /* reset */ }`,
		action: "storeTrue"
	});
	parser.addArgument(["--trans-file"], {
		help: "Location of a translations csv file"
	});
	parser.addArgument(["--trans-lang"], {
		help: "case-SENSITIVE Translations language (e.g, pt-BR)"
	});

	parser.addArgument(["--rules-dir"], {
		help: "Directory containing JSON file with version rules to load"
	});

	/*
	//  implementation of a confirmation prompt function is below
		parser.addArgument(["-c", "--require-update-confirm"], {
			help: "Ask for confirmation before updating earn offers",
			action: "storeTrue"
		});
	*/
	const parsed = parser.parseArgs();
	parsed.app_list = parsed.app_list ? parsed.app_list.split(",") : [];
	return parsed as ScriptConfig;
}

/*
//  When we decide to add this capability we should uncomment this
function confirmPrompt(message: string) {
	const readline = require("readline");
	const prompt = readline.createInterface(process.stdin, process.stdout);
	return new Promise(resolve => {
		prompt.question(message + "\n", (answer: string) => {
			prompt.close();
			resolve(answer);
		});
	});
}
*/

async function processJsonDir(dir: string, callback: (data: any, filename: string) => void) {
	for (const filename of fs.readdirSync(path(dir))) {
		if (!filename.endsWith(".json")) {
			console.info(`skipping non json file ${ filename }`);
			continue;
		}
		const data = JSON.parse(fs.readFileSync(path(join(dir, filename))).toString());
		await callback(data, filename);
	}
}

export async function initDb(scriptConfig: ScriptConfig, closeConnectionWhenDone: boolean = true) {
	const appsDir = scriptConfig.apps_dir;
	if (appsDir) {
		processJsonDir(appsDir, data => {
			return createApp(
				data.app_id,
				data.name,
				data.jwt_public_keys,
				data.api_key,
				data.config,
				scriptConfig.dry_run!);
		});
	}

	const offersDir = scriptConfig.offers_dir;
	if (offersDir) {
		const appList = scriptConfig.app_list;
		if (!appList || !appList.length) {
			throw Error("Application list must be given via `--app-list`. See help (--help)");
		}

		// sanity on app ids
		if (!(appList[0] === "ALL")) {
			await Promise.all(appList.map(async appId => {
				if (!await Application.findOneById(appId)) {
					throw Error(`Application not found ${ appId }`);
				}
			}));
		}
		// create offers from csv
		const parseCsv = require("csv-parse/lib/sync");
		const createOfferOptions: EarnOptions = {
			doNotUpdateExiting: scriptConfig.no_update!,
			dryRun: scriptConfig.dry_run!,
			confirmUpdate: scriptConfig.require_update_confirm!,
			onlyUpdateMetaImage: scriptConfig.update_earn_thumbnails,
			onlyUpdate: scriptConfig.only_update,
		};
		for (const filename of fs.readdirSync(path(offersDir))) {
			console.log(`read ${ filename }`);

			const offersCsv = fs.readFileSync(path(join(offersDir, filename)));
			const parsed = parseCsv(offersCsv);

			const title = readTitle(parsed[0][0]);
			const contentType = parsed[0][0].split(/ +/, 2)[1].toLowerCase() as ContentType;
			let results = [];
			if (title === "Spend") {
				results = await
					parseSpend(parsed, appList);
				createOfferOptions.verbose && console.log(`created spend:${ contentType } offers`);
			} else if (title === "Earn") {
				results = await
					parseEarn(parsed, contentType, appList, createOfferOptions);
				createOfferOptions.verbose && console.log(`created earn:${ contentType } offers`);
			} else {
				throw new Error("Failed to parse " + parsed[0][0]);
			}
		}
	}
	const translationsFile = scriptConfig.trans_file;
	const translationsLanguage = scriptConfig.trans_lang;
	if (translationsFile && translationsLanguage) {
		const generatedStringsFileName = "/tmp/local_translations_template-by_manage_db_script.csv";
		const translationsFilename = "/tmp/translations-by_manage_db_script.csv";
		console.log("creating translations template file");
		await translations.writeCsvTemplateToFile(generatedStringsFileName);
		console.log("adapting test translations file");
		await adaptTranslations.processFile(translationsFile, generatedStringsFileName, translationsFilename);
		if (!scriptConfig.dry_run) {
			console.log("processing translations and inserting into db");
			await translations.processFile(translationsFilename, translationsLanguage);
		}
		console.log("Done. Translations Ready.");
	} else if (translationsFile || translationsLanguage) {
		throw Error("Both a translations file and a translations language need to be specified.");
	}

	const rulesDir = scriptConfig.rules_dir;
	if (rulesDir) {
		await processJsonDir(rulesDir, async (rules: any[], filename) => {
			await Promise.all(rules.map(async data => {
				const assetType = filename.split(".")[0] as "image";
				const rule = SdkVersionRule.new({ comparator: data.comparator, assetType, data: data.data });
				console.log(`adding rule ${ rule.comparator } for asset ${ rule.assetType }`);
				!scriptConfig.dry_run && await rule.save() && console.log(`Rule ${rule.comparator} saved`);
				await rule.save();
				await SdkVersionRule.find();
			}));
		});
	}

	if (closeConnectionWhenDone) {
		try {
			await closeDbConnection();
		} catch (e) {
		}
	}
	console.log(`done.`);

}

/*  Called from Cli  */
if (require.main === module) {
	scriptConfig = initArgsParser();
	initModels(scriptConfig.create_db).then(async () => {
		await initDb(scriptConfig);
	}).catch(async (error: Error) => {
		console.log("error: " + error.message + "\n" + error.stack);
		try {
			await closeDbConnection();
		} catch (e) {
		}
		console.log(`done.`);
	});
}
