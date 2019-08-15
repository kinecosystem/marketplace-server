import { ExportToCsv, Options as ExportCsvOptions } from "export-to-csv";
import { FindManyOptions } from "typeorm";
import csvParse = require("csv-parse/lib/sync");
import { Options } from "csv-parse";

import { writeFile, readFileSync } from "fs";

import { ContentType, Offer, OfferContent } from "../models/offers";
import { OfferTranslation } from "../models/translations";
import { path } from "../utils/path";

import * as _ from "lodash";

function parseContent(content: string): OfferContentContent {
	const validContent = content.replace(/:\s(\${[\w\.-_]+})/g, ": \"$1\"");  //  Content must be escape as it isn't a valid JSON
	return JSON.parse(validContent);
}

export function normalizeLanguageString(str: string) {
	return str.toLocaleLowerCase().replace("_", "-");
}

/**** Export CSV Template ****/
export type CsvRow = {
	Type: string;
	Key: string;
	Default: string;
	Translation: "";
	"Character limit": number;
};

type OfferContentContent = {  // I know, but I didn't have a better name for the 'content' field in the OfferContent table
	pages?: any[]
	confirmation?: {
		title: string;
		description: string;
		image: string;
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
	"poll:offer_contents:content:pages.rewardText": 30,
	"poll:offer_contents:content:pages.rewardValue": 12,
	"quiz:offer:title": 14,
	"quiz:offer:description": 18,
	"quiz:offer:orderTitle": 8,
	"quiz:offer:orderDescription": 24,
	"quiz:offer_contents:content:pages.title": 38,
	"quiz:offer_contents:content:pages.description": 66,
	"quiz:offer_contents:content:pages.question.answers": 22,
	"quiz:offer_contents:content:pages.rewardText": 30,
	"quiz:offer_contents:content:pages.rewardValue": 12,
};

const EXCLUDED = [
	"tutorial",
	"quiz:offer_contents:content:pages.question.id",
	"poll:offer_contents:content:pages.question.id",
];

function constructRow(contentType: ContentType, key: string, str: string) {
	// this transfroms something like:
	// offer_contents:Generic Poll #18:content:pages[0].question.answers[1]
	// to:
	// offer_contents:content:pages.question.answers
	const path = `${ contentType }:${ key.replace(/:(.*?):/, ":").replace(/\[.\]/g, "") }`;
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
		console.warn(`Empty content for KeyBase ${ keyBase }`);
		return [];
	}
	let result: CsvRow[] = [];
	arr.forEach((item: any, index: number) => {
		const key = `${ keyBase }[${ index }]`;
		result = result.concat(handleIterableItem(key, item, rowConstructor));
	});
	return result;
}

function constructRowsFromObj(keyBase: string, obj: { [key: string]: any }, rowConstructor: RowConstructor) {
	if (!obj) {
		console.warn(`Empty content for KeyBase ${ keyBase }`);
		return [];
	}
	let result: CsvRow[] = [];
	Object.keys(obj).forEach((itemKey: any) => {
		const item = obj[itemKey];
		const key = `${ keyBase }.${ itemKey }`;
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
		const offerName = offer.name;
		const offerContent: OfferContent = allContent.filter(obj => obj.offerId === offerId)[0];
		// quote unquoted template values
		const offerContentContent = parseContent(offerContent.content);
		const boundConstructRow = constructRow.bind({}, offerContent.contentType);
		let keyBase = `offer:${ offerName }`;
		rows = rows.concat([
			boundConstructRow(`${ keyBase }:title`, offer.meta.title),
			boundConstructRow(`${ keyBase }:description`, offer.meta.description),
			boundConstructRow(`${ keyBase }:orderTitle`, offer.meta.order_meta.title),
			boundConstructRow(`${ keyBase }:orderDescription`, offer.meta.order_meta.description),
		]);
		keyBase = `offer_contents:${ offerName }`;
		if (offerContentContent.pages) {
			rows = rows.concat(constructRowsFromArray(`${ keyBase }:content:pages`, offerContentContent.pages, boundConstructRow));
		} else if (offerContentContent.confirmation) {
			rows = rows.concat(constructRowsFromObj(`${ keyBase }:content:confirmation`, offerContentContent.confirmation, boundConstructRow));
		} else {
			console.warn(`Couldn't construct row for keyBase ${ keyBase }`);
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
		showTitle: false,
		useBom: true,
		useKeysAsHeaders: true,
		// headers: ['Column 1', 'Column 2', etc...] <-- Won't work with useKeysAsHeaders present!
	};

	const csvExporter = new ExportToCsv(options);
	return csvExporter.generateCsv(await getCsvRowData(), true);
}

export async function writeCsvTemplateToFile(fileName: string = "translation_template.csv") {
	return new Promise(async (resolve, reject) => {
		writeFile(fileName, await getCsvTemplateData(), (err: NodeJS.ErrnoException | null) => {
			if (err) {
				console.error("Error:", err);
				reject(err);
				return;
			}
			console.log("CSV saved as", fileName);
			resolve(fileName);
		});
	});
}

/**** Import CSV ****/

/*** Example CSV:
 Type,Key,Default,Translation,Character Limit
 poll,offer:Generic Poll #40:title,Favorites,Favoritos,14
 poll,offer:Generic Poll #40:description,Let us know!,Avise-nos!,18
 poll,offer:Generic Poll #40:orderTitle,Poll,Enquete,8
 poll,offer:Generic Poll #40:orderDescription,Completed,Concluído,24
 poll,offer_contents:Generic Poll #40:content:pages[0].title,Choose your favorite city,Escolha sua cidade preferida,38
 poll,offer_contents:Generic Poll #40:content:pages[0].question.answers[0],San Francisco,São Francisco,22
 poll,offer_contents:Generic Poll #40:content:pages[0].question.answers[1],New York City,Cidade de Nova York,22
 poll,offer_contents:Generic Poll #40:content:pages[0].question.answers[2],Miami,Miami,22
 poll,offer_contents:Generic Poll #40:content:pages[0].question.answers[3],Austin,Austin,22
 poll,offer_contents:Generic Poll #40:content:pages[1].title,Choose your favorite flower,Escolha sua flor preferida,38
 poll,offer_contents:Generic Poll #40:content:pages[1].question.answers[0],Rose,Rosa,22
 poll,offer_contents:Generic Poll #40:content:pages[1].question.answers[1],Daffodil,Narciso,22
 poll,offer_contents:Generic Poll #40:content:pages[1].question.answers[2],Petunia,Petúnia,22
 poll,offer_contents:Generic Poll #40:content:pages[1].question.answers[3],Daisy,Margarida,22
 ***/

export type CsvParse = ((input: Buffer, options?: Options) => any) & typeof csvParse;

export type TranslationDataRow = [string, string, string, string, number];
export type TranslationData = TranslationDataRow[];
export type OfferTranslationData = {
	title: string;
	description: string;
	orderDescription: string;
	orderTitle: string;
	content: any;
};

type Column = "title" | "description" | "orderDescription" | "orderTitle" | "content";
type Table = "offer" | "offerContent";
type OffersTranslation = { [index: string]: OfferTranslationData };
type OffersTranslationRow = {
	offer: Offer;
	offerId: string;
	context: Table;
	path: string;
	language: string;
	translation: string;
};

type CsvKeyElementsArray = [Table, string, Column, string | undefined];

function getCsvKeyElements(key: string): CsvKeyElementsArray {
	return key.split(":") as CsvKeyElementsArray;
}

function getOfferContentFromJson(offerContent?: OfferContent) {
	if (!offerContent) {
		return {};
	}
	return parseContent(offerContent.content);
}

async function insertIntoDb(data: OffersTranslation, language: string) {
	const allOffers = await Offer.find({ type: "earn" });
	const dbReadyData: OffersTranslationRow[] = [];
	Object.entries(data).forEach(([offerId, offerTranslations]) => {
		const offer = allOffers.find(offer => offer.id === offerId);
		if (!offer) {
			console.warn("DB missing offer, offer ID:", offerId);
			return;
		}
		Object.entries(offerTranslations).forEach(([column, translation]) => {
			if (column === "content") {
				dbReadyData.push({
					context: "offerContent",
					translation: JSON.stringify(translation),
					offer,
					path: column,
					language,
					offerId: offer.id,
				});
			} else {
				dbReadyData.push({
					context: "offer",
					translation,
					offer,
					path: column,
					language,
					offerId: offer.id,
				});
			}
		});
	});
	console.info(`inserting ${ dbReadyData.length } translations`);
	await OfferTranslation.createQueryBuilder().insert().values(dbReadyData)
		.onConflict(`("offer_id", "context", "path", "language") DO UPDATE SET offer_id=EXCLUDED.offer_id, context=EXCLUDED.context, path=EXCLUDED.path, language=EXCLUDED.language`)
		.execute();
}

//  TODO: add validation
async function processTranslationData(csvDataRows: TranslationData) {
	const allOffers = await Offer.find({ type: "earn" });
	const allOfferContents = await OfferContent.find({ select: ["offerId", "content"] } as FindManyOptions<OfferContent>);
	const allContentTranslations: OffersTranslation = {};
	csvDataRows.forEach(([__, csvKey, ___, translation]) => {
		if (!translation) {
			return;
		}
		// const [table, offerId, column, jsonPath] = getCsvKeyElements(csvKey);
		const [table, offerName, column, jsonPath] = getCsvKeyElements(csvKey);
		// const currentOffer = _.find(allOffers, function(offer: Offer) {
		// 	return offer.name === offerName;
		// });
		const currentOffer = allOffers.find((offer: Offer) => {
			return offer.name === offerName;
		});
		if (currentOffer){
			const offerId = currentOffer.id;
			let offerTranslations;
			if (offerId in allContentTranslations) {
				offerTranslations = allContentTranslations[offerId];
			} else {
				offerTranslations = { content: getOfferContentFromJson(allOfferContents.find(content => content.offerId === offerId)) } as OfferTranslationData;
			}
			if (table === "offer") {
				offerTranslations[column] = translation;
			} else {
				const evalString = `offerTranslations.content.${ jsonPath }=translation`;
				try {
					/* tslint:disable-next-line:no-eval */
					eval(evalString);
				} catch (e) {
					console.error("content eval failed: \neval string: %s\n error message: %s", evalString, e);
				}
			}
			allContentTranslations[offerId] = offerTranslations;
		}
	});
	return allContentTranslations;
}

//  rowOffset is a 0 base index of the row to start with
export async function processFile(filename: string, languageCode: string, rowOffset = 1): Promise<void> {
	if (!filename || !languageCode) {
		console.error("Both filename and language code are required");
		throw new Error("Both filename and language code are required");
	}
	const csv = readFileSync(path(filename));
	const parsedCsv = (csvParse as CsvParse)(csv);
	parsedCsv.splice(0, rowOffset);
	const data = await processTranslationData(parsedCsv);
	console.info("inserting to DB");
	await insertIntoDb(data, languageCode);
	console.info("done inserting to DB");
}
