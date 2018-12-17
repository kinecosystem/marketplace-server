import csvParse = require("csv-parse/lib/sync");
import { ExportToCsv, Options as ExportCsvOptions } from "export-to-csv";

import { readFileSync, writeFile } from "fs";

import { path } from "./utils/path";
import { CsvParse, TranslationData } from "./admin/translations";

function getOfferTranslation(inputCsv: TranslationData) {
	return inputCsv.reduce((dict, [type, key, defaultStr, translation]) => {
		if (!translation || !translation.length) {
			return dict;
		}
		dict[defaultStr] = translation;
		return dict;
	}, {} as { [defaultStr: string]: string });
}

async function addTranslationTo(csv: TranslationData, fromDict: { [defaultStr: string]: string }) {
	return csv.map(([type, key, defaultStr, __, charLimit]) => ({
			Type: type,
			Key: key,
			Default: defaultStr,
			Translation: fromDict[defaultStr] || defaultStr,
			"Character Limit": charLimit,
		}));
}

function writeCsvDataToFile(data: any[], fileName: string) {
	const options = {
		fieldSeparator: ",",
		quoteStrings: "\"",
		decimalseparator: ".",
		showLabels: true,
		showTitle: false,
		useBom: true,
		useKeysAsHeaders: true,
	};

	const csvExporter = new ExportToCsv(options);
	writeFile(fileName, csvExporter.generateCsv(data, true), err => {
		if (err) {
			console.error("Error:", err);
			return;
		}
		console.log("CSV saved as", fileName);
	});
}

export async function processFile(translationFile: string, fileToTranslate: string, saveAs: string | null = null, rowOffSet: number = 1) {
	if (!translationFile || !fileToTranslate) {
		console.error("Both input and output file are required");
		return;
	}
	const translationCsv = readFileSync(path(translationFile));
	const outputCsv = readFileSync(path(fileToTranslate));
	const parsedTranslationCsv = (csvParse as CsvParse)(translationCsv);
	const parsedCsvToTranslate = (csvParse as CsvParse)(outputCsv);
	parsedTranslationCsv.splice(0, rowOffSet);
	parsedCsvToTranslate.splice(0, rowOffSet);
	const offerToTranslationDict = getOfferTranslation(parsedTranslationCsv);
	const translatedData = await addTranslationTo(parsedCsvToTranslate, offerToTranslationDict);
	if (!saveAs) {
		const segments = fileToTranslate.split(".");
		segments[0] = segments[0] + "-translated";
		saveAs = segments.join(".");
	}
	writeCsvDataToFile(translatedData, saveAs);
}
