import { close as closeModels, init as initModels } from "./models";
import * as fs from "fs";
import { path } from "./utils";
import { join } from "path";
import { ContentType } from "./models/offers";
import { readTitle } from "./create";

const EARN = "Earn";
const SPEND = "Spend";

/****** CONFIG *******/
const OFFER_TYPE_TO_PROCESS = [EARN];

function main() {
	initModels(true).then(async () => {
		const csvFilePath = process.argv[2];

		// create offers from csv
		const parseCsv = require("csv-parse/lib/sync");
		const offersCsv = fs.readFileSync(path(join(offersDir, csvFilePath)));
		const parsed = parseCsv(offersCsv);

		const title = readTitle(parsed[0][0]);
		const contentType = parsed[0][0].split(/ +/, 2)[1].toLowerCase() as ContentType;
		if (title === SPEND && OFFER_TYPE_TO_PROCESS.includes(SPEND)) {
			await parseSpend(parsed);
			console.log(`created spend:${contentType} offers`);
		} else if (title === EARN && OFFER_TYPE_TO_PROCESS.includes(EARN)) {
			await parseEarn(parsed, contentType);
			console.log(`created earn:${contentType} offers`);
		} else {
			throw new Error("Failed to parse " + parsed[0][0]);
		}
		await closeModels();
		console.log(`done.`);
	}).catch(async (error: Error) => {
		console.log("error: " + error.message + "\n" + error.stack);
		await closeModels();
		console.log(`done.`);
	});
}

main();
