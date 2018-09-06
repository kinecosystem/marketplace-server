import { ExportToCsv, Options as ExportCsvOptions } from "export-to-csv";

import { ContentType, Offer, OfferContent } from "../models/offers";

type CsvRow = {
	Key: string;
	Default: string;
	Translation: null;
};

type OfferContentContent = {  // I know, but I didn't have a better name for the 'content' field in the OfferContent table
	pages?: any[]
	confirmation?: {
		title: string,
		description: string,
		image: string
	}
};

//  const EXCLUDED_CONTENT_PAGE_ATTRIBUTE = ["amount", "type", "rightAnswer"];

function constructRow(contentType: ContentType, key: string, str: string) {
	return {
		Type: contentType,
		Key: key,
		Default: str,
		Translation: null
	};
}

function constructRowsFromArray(keyBase: string, arr: any[], rowConstructor: (key: string, str: string) => CsvRow) {
	let result: CsvRow[] = [];
	arr.forEach((item: any, index: number) => {
		const key = `${keyBase}[${index}]`;
		if (typeof item === "string") {
			result.push(rowConstructor(key, item));
			return;
		}
		if (Array.isArray(item)) {
			result = result.concat(constructRowsFromArray(key, item, rowConstructor));
		}

		if (typeof item === "object") {
			result = result.concat(constructRowsFromObj(key, item, rowConstructor));
		}
	});
	return result;
}

function constructRowsFromObj(keyBase: string, obj: { [key: string]: any }, rowConstructor: (key: string, str: string) => CsvRow) {
	let result: CsvRow[] = [];
	Object.keys(obj).forEach((itemKey: any) => {
		const item = obj[itemKey];
		const key = `${keyBase}.${itemKey}`;
		if (typeof item === "string") {
			result.push(rowConstructor(key, item));
			return;
		}
		if (Array.isArray(item)) {
			result = result.concat(constructRowsFromArray(key, item, rowConstructor));
		}

		if (typeof item === "object") {
			result = result.concat(constructRowsFromObj(key, item, rowConstructor));
		}
	});
	return result;
}

async function getCsvRowData() {
	const allOffers = await Offer.find();
	const allContent = await OfferContent.find({ select: ["offerId", "content", "contentType"] });
	let rows: CsvRow[] = [];
	const csvContent: any = allOffers.map(offer => {
		const offerId = offer.id;
		const keyBase = `offer:${offerId}`;
		const offerContent: OfferContent = allContent.filter(obj => obj.offerId === offerId)[0];
		const regex = /:\s(\${[\w\.-_]+})/g;
		const escapedOfferContent = offerContent.content.replace(regex, ": \"$1\"");  // quote unquoted template values
		const offerContentContent: OfferContentContent = JSON.parse(escapedOfferContent);
		const offerType = offerContent.contentType;
		const boundConstructRow = constructRow.bind({}, offerType);
		rows = rows.concat([
			// boundConstructRow(`${keyBase}:title`, offer.title),
			// boundConstructRow(`${keyBase}:description`, offer.description),
			boundConstructRow(`${keyBase}:order_title`, offer.meta.title),
			boundConstructRow(`${keyBase}:order_description`, offer.meta.description),
		]);
		if (offerContentContent.pages) {
			rows = rows.concat(constructRowsFromArray(`${keyBase}:content:pages`, offerContentContent.pages, boundConstructRow));
		}
		if (offerContentContent.confirmation) {
			rows = rows.concat(constructRowsFromObj(`${keyBase}:content:confirmation`, offerContentContent.confirmation, boundConstructRow));
		}
	});
	return rows;
}

export async function getCsvTemplate() {
	const options: ExportCsvOptions = {
		fieldSeparator: ",",
		quoteStrings: "'",
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
