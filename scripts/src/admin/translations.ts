import { ExportToCsv, Options as ExportCsvOptions } from "export-to-csv";
import { FindManyOptions } from "typeorm";

import { writeFile } from "fs";

import { ContentType, Offer, OfferContent } from "../models/offers";

type CsvRow = {
	Type: string;
	Key: string;
	Default: string;
	Translation: "";
	"Character limit": number;
};

type OfferContentContent = {  // I know, but I didn't have a better name for the 'content' field in the OfferContent table
	pages?: any[]
	confirmation?: {
		title: string,
		description: string,
		image: string
	}
};

const CHARACTER_LIMITS: { [path: string]: number } = {
	"poll:offer:title": 14,
	"poll:offer:description": 18,
	"poll:offer:orderTitle": 8,
	"poll:offer:orderDescription": 24,
	"poll:offer_contents:content:pages.title": 38,
	"poll:offer_contents:content:pages.description": 24,
	"poll:offer_contents:content:pages.question.answers": 22,
	"quiz:offer:title": 14,
	"quiz:offer:description": 18,
	"quiz:offer:orderTitle": 8,
	"quiz:offer:orderDescription": 24,
	"quiz:offer_contents:content:pages.description": 66,
	"quiz:offer_contents:content:pages.question.answers": 22,
};

const KEY_TO_PATH_REGEX = /\b([\w_]+:)\w+:|\[\d\]/g;

const EXCLUDED = [
	"tutorial",
	"quiz:offer_contents:content:pages.question.id",
	"poll:offer_contents:content:pages.question.id",
];

function constructRow(contentType: ContentType, key: string, str: string) {
	const path = `${contentType}:${key.replace(KEY_TO_PATH_REGEX, "$1")}`;
	if (EXCLUDED.includes(path) || EXCLUDED.includes(contentType)) {
		return;
	}
	return {
		Type: contentType,
		Key: key,
		Default: str,
		Translation: "",
		"Character Limit": CHARACTER_LIMITS[path],
	};
}

type RowConstructor = (key: string, str: string) => CsvRow;

function handleIterableItem(key: string, item: any, rowConstructor: RowConstructor) {
	if (typeof item === "string" && item !== "") {
		return [rowConstructor(key, item)];
	}
	if (Array.isArray(item)) {
		return constructRowsFromArray(key, item, rowConstructor);
	}

	if (typeof item === "object") {
		return constructRowsFromObj(key, item, rowConstructor);
	}
	return [];
}

function constructRowsFromArray(keyBase: string, arr: any[], rowConstructor: RowConstructor) {
	if (!arr) {
		return [];
	}
	let result: CsvRow[] = [];
	arr.forEach((item: any, index: number) => {
		const key = `${keyBase}[${index}]`;
		result = result.concat(handleIterableItem(key, item, rowConstructor));
	});
	return result;
}

function constructRowsFromObj(keyBase: string, obj: { [key: string]: any }, rowConstructor: RowConstructor) {
	if (!obj) {
		return [];
	}
	let result: CsvRow[] = [];
	Object.keys(obj).forEach((itemKey: any) => {
		const item = obj[itemKey];
		const key = `${keyBase}.${itemKey}`;
		result = result.concat(handleIterableItem(key, item, rowConstructor));
	});
	return result;
}

async function getCsvRowData() {
	const allOffers = await Offer.find({ type: "earn" });
	const allContent = await OfferContent.find({ select: ["offerId", "content", "contentType"] } as FindManyOptions<OfferContent>);
	let rows: CsvRow[] = [];
	allOffers.forEach(offer => {
		const offerId = offer.id;
		const offerContent: OfferContent = allContent.filter(obj => obj.offerId === offerId)[0];
		// quote unquoted template values
		const escapedOfferContent = offerContent.content.replace(/:\s(\${[\w\.-_]+})/g, ": \"$1\"");  //  Content must be escape as it isn't a valid JSON
		const offerContentContent: OfferContentContent = JSON.parse(escapedOfferContent);
		const boundConstructRow = constructRow.bind({}, offerContent.contentType);
		let keyBase = `offer:${offerId}`;
		rows = rows.concat([
			boundConstructRow(`${keyBase}:title`, offer.meta.title),
			boundConstructRow(`${keyBase}:description`, offer.meta.description),
			boundConstructRow(`${keyBase}:orderTitle`, offer.meta.order_meta.title),
			boundConstructRow(`${keyBase}:orderDescription`, offer.meta.order_meta.description),
		]);
		keyBase = `offer_contents:${offerId}`;
		if (offerContentContent.pages) {
			rows = rows.concat(constructRowsFromArray(`${keyBase}:content:pages`, offerContentContent.pages, boundConstructRow));
		}
		if (offerContentContent.confirmation) {
			rows = rows.concat(constructRowsFromObj(`${keyBase}:content:confirmation`, offerContentContent.confirmation, boundConstructRow));
		}
	});
	return rows.filter(x => x);  // remove empty items
}

export async function getCsvTemplateData() {
	const options: ExportCsvOptions = {
		fieldSeparator: ",",
		quoteStrings: "\"",
		decimalseparator: ".",
		showLabels: true,
		showTitle: true,
		title: "Translation CSV Template",
		useBom: true,
		useKeysAsHeaders: true,
		// headers: ['Column 1', 'Column 2', etc...] <-- Won't work with useKeysAsHeaders present!
	};

	const csvExporter = new ExportToCsv(options);
	return csvExporter.generateCsv(await getCsvRowData(), true);
}

export async function writeCsvTemplateToFile(fileName: string = "translation_template.csv") {
	writeFile(fileName, await getCsvTemplateData(), (err: NodeJS.ErrnoException) => {
		if (err) {
			console.log("Error:", err);
		}
		console.log("CSV saved as", fileName);
	});
}
