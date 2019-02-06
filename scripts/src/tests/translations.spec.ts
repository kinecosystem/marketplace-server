import csvParse = require("csv-parse/lib/sync");

import * as path from "path";
import { readFileSync } from "fs";

import { CsvParse, TranslationDataRow } from "../admin/translations";
import { init as initModels, close as closeModels } from "../models/index";
import { processFile as adaptCsv } from "../adapt_translation_csv";
import * as translations from "../admin/translations";
import { Offer, OfferContent } from "../models/offers";
import { OfferTranslation } from "../models/translations";
import { initLogger } from "../logging";
import * as helpers from "./helpers";
import { localCache } from "../utils/cache";
import { initDb } from "../manage_db_data";

const CSV_TEMPLATE_FILE = "/tmp/translations_template-by_tests.csv";
const CSV_TRANSLATION_FILE = "/tmp/translations-by_tests.csv";  // The file the adapted translations will be written to

describe("translations tests", async () => {
	jest.setTimeout(30000);
	beforeAll(async done => {
		initLogger();
		await initModels();
		await helpers.clearDatabase();
		const scriptConfig = {
			apps_dir: "data/apps",
			offers_dir: "data/offers",
			update_earn_thumbnails: false,
			no_update: false,
			only_update: false,
			dry_run: false,
			require_update_confirm: false,
			app_list: ["ALL"],
			create_db: true,
			trans_file: null,
			trans_lang: null,
		};
		await initDb(scriptConfig, false);
		helpers.patchDependencies();
		localCache.clear();
		done();
	});

	afterAll(async done => {
		await closeModels();
		done();
	});

	test("test writeCsvTemplateToFile", async done => {
		jest.setTimeout(30000);
		console.log("test writeCsvTemplateToFile START");
		await translations.writeCsvTemplateToFile(CSV_TEMPLATE_FILE);
		const csv = readFileSync(CSV_TEMPLATE_FILE);
		const parsedCsv = (csvParse as CsvParse)(csv);
		const csvData = parsedCsv.splice(1);
		const [type, key, defaultStr, translation, charLimit] = (csvData[Math.round(csvData.length / 2)]) as TranslationDataRow;  // Get a translation
		expect(type).toMatch(/poll|quiz/);
		const keySegments = key.split(":");
		expect(keySegments.length).toBeGreaterThanOrEqual(3);
		expect(keySegments[0]).toMatch(/offer$|offer_contents/);
		expect(keySegments[1]).toMatch(/O[\w]{20}/); // Validate offer id starts with O and is 21 chars
		expect(keySegments[2]).toMatch(/title$|description$|orderDescription|orderTitle|content$/);
		expect(typeof defaultStr).toBe("string");
		expect(defaultStr.length).toBeGreaterThan(1);
		expect(typeof translation).toBe("string");
		expect(translation.length).toBe(0);
		expect(Number(charLimit)).toBeGreaterThan(0);
		console.log("test writeCsvTemplateToFile DONE");
		done();
	});

	test("Adapt test translation CSV to the offers in the DB", async done => {
		console.log("Adapt test translation CSV... START");
		await translations.writeCsvTemplateToFile(CSV_TEMPLATE_FILE);
		await adaptCsv(path.join(__dirname, "../../../data/translations/test_pt-BR.csv"), CSV_TEMPLATE_FILE, CSV_TRANSLATION_FILE);
		const csv = readFileSync(CSV_TRANSLATION_FILE);
		const parsedCsv = (csvParse as CsvParse)(csv);
		const csvData = parsedCsv.splice(1);
		let [type, key, defaultStr, translation, charLimit] = (csvData[Math.round(csvData.length / 2)]) as TranslationDataRow; // Get a random translation
		expect(translation.length).toBeGreaterThan(0);
		expect(translation.length).toBeLessThanOrEqual(Number(charLimit));
		const testTranslation = csvData.filter(([type, key, defaultStr, translation]: [string, string, string, string]) => translation === "Favoritos");
		expect(testTranslation.length).toBe(1);
		[type, key, defaultStr, translation, charLimit] = testTranslation[0];
		const [table, offerId, column, jsonPath] = key.split(":");
		expect((await Offer.findOne({ id: offerId }))!.meta.title).toBe("Favorites");
		console.log("Adapt test translation CSV... DONE");
		done();
	});

	test("processFile (import) translation CSV", async done => {
		console.log("processFile (import) translation CSV START");
		await translations.writeCsvTemplateToFile(CSV_TEMPLATE_FILE);
		await adaptCsv(path.join(__dirname, "../../../data/translations/test_pt-BR.csv"), CSV_TEMPLATE_FILE, CSV_TRANSLATION_FILE);
		translations.processFile(CSV_TRANSLATION_FILE, "pt-BR");
		expect(await OfferTranslation.find({ translation: "Favoritos" }));
		console.log("processFile (import) translation CSV DONE");
		done();
	});
});
