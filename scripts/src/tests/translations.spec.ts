import * as expect from "expect";
import csvParse = require("csv-parse/lib/sync");

import * as path from "path";
import { readFileSync } from "fs";

import { CsvParse, TranslationDataRow } from "../admin/translations";
import { init as initModels, close as closeModels } from "../models/index";
import { processFile as adaptCsv } from "../adapt_translation_csv";
import * as translations from "../admin/translations";
import { Offer, OfferContent } from "../models/offers";
import { OfferTranslation } from "../models/translations";

const CSV_TEMPLATE_FILE = "/tmp/translations_template.csv";
const CSV_TRANSLATION_FILE = "/tmp/translation.csv";

describe("translations tests", async () => {
	beforeAll(async done => {
		await initModels();
		done();
	});

	afterAll(async () => {
		await closeModels();
	});

	test("test writeCsvTemplateToFile", async () => {
		await translations.writeCsvTemplateToFile(CSV_TEMPLATE_FILE);
		const csv = readFileSync(CSV_TEMPLATE_FILE);
		const parsedCsv = (csvParse as CsvParse)(csv);
		const csvData = parsedCsv.splice(1);
		const [type, key, defaultStr, translation, charLimit] = (csvData[Math.floor(csvData.length / 2)]) as TranslationDataRow;
		expect(type).toMatch(/poll|quiz/);
		const keySegments = key.split(":");
		expect(keySegments.length).toBeGreaterThan(3);
		expect(keySegments[0]).toMatch(/offer$|offer_contents/);
		expect(keySegments[1]).toMatch(/O[\w]{20}/); // Validate user id starts with ) and is 21 chars
		expect(keySegments[2]).toMatch(/title$|description$|orderDescription|orderTitle|content$/);
		expect(typeof defaultStr).toBe("string");
		expect(defaultStr.length).toBeGreaterThan(1);
		expect(typeof translation).toBe("string");
		expect(translation.length).toBe(0);
		expect(Number(charLimit)).toBeGreaterThan(0);
	});

	test("Adapt test translation CSV to the offers in the DB", async () => {
		await adaptCsv(path.join(__dirname, "../../../data/translations/test_pt-BR.csv"), CSV_TEMPLATE_FILE, CSV_TRANSLATION_FILE);
		const csv = readFileSync(CSV_TRANSLATION_FILE);
		const parsedCsv = (csvParse as CsvParse)(csv);
		console.log("contents of csv:\n", parsedCsv);
		const csvData = parsedCsv.splice(1);
		let [type, key, defaultStr, translation, charLimit] = (csvData[Math.floor(csvData.length / 2)]) as TranslationDataRow;
		console.log(type, key, defaultStr, translation, charLimit);
		expect(translation.length).toBeGreaterThan(0);
		expect(translation.length).toBeLessThan(Number(charLimit));
		const testTranslation = csvData.filter(([type, key, defaultStr, translation]: [string, string, string, string ]) => translation === "Favoritos");
		expect(testTranslation.length).toBe(1);
		[type, key, defaultStr, translation, charLimit] = testTranslation[0];
		const [table, offerId, column, jsonPath] = key.split(":");
		expect((await Offer.findOne({ id: offerId }))!.meta.title).toBe("Favorites");
	});

	// test("processFile (import) translation CSV", async () => {
	// 	translations.processFile(path.join(__dirname, "../../../data/translations/test_pt-BR.csv"), CSV_TEMPLATE_FILE);
	// 	expect(await OfferTranslation.find({ translation: "Favoritos" }));
	// });
});
