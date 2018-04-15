/**
 * This file populates a demo database for the sole sake of mocking data to populate our SDK client.
 * All the names of companies, products and KIN values are completely made up and are used for TESTING only.
 */
import { getConfig } from "./public/config"; // must be the first import
getConfig();

import * as fs from "fs";
import { Offer } from "./models/offers";

import { init as initModels } from "./models";
import { PageType, Poll, Tutorial } from "./public/services/offer_contents";
import { createEarn, createSpend } from "./create_data/offers";

function readTitle(title: string): string {
	// read until first space
	if (title.includes(" ")) {
		return title.substr(0, title.indexOf(" "));
	} else {
		return title;
	}
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

async function parseSpend(data: string[][]) {
	const list = toMap(data);

	for (const v of list) {
		await createSpend(
			v.get("OfferName")!,
			v.get("WalletAddress")!,
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
	}
}

async function parseEarn(data: string[][]) {
	const list = toMap(data);

	const poll: Poll | Tutorial = { pages: [] };
	let offer: Map<string, string> | undefined;

	function createEarnInner(offer: Map<string, string>, poll: Poll | Tutorial): Promise<Offer> {
		return createEarn(
			offer.get("OfferName")!,
			offer.get("WalletAddress")!,
			offer.get("Brand")!,
			offer.get("Title")!,
			offer.get("Description")!,
			offer.get("Image")!,
			parseInt(offer.get("Amount")!, 10),
			parseInt(offer.get("CapTotal")!, 10),
			parseInt(offer.get("CapPerUser")!, 10),
			offer.get("OrderTitle")!,
			offer.get("OrderDescription")!,
			poll);
	}

	for (const v of list) {
		if (v.get("OfferName") !== "") {
			if (offer) {
				await createEarnInner(offer, poll);
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
		} else if (v.get("PollPageType")! === "EarnThankYou") {
			(poll as Poll).pages.push({
				type: PageType.EarnThankYou,
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
		await createEarnInner(offer, poll);
	}
}

/*initModels().then(async () => {
	const parseCsv = require("csv-parse/lib/sync");

	for (let i = 1; i <= 3; i++) {
		const spend = fs.readFileSync(`./data/${i}.csv`);
		const parsed = parseCsv(spend);
		const title = readTitle(parsed[0][0]);
		if (title === "Spend") {
			await parseSpend(parsed);
		} else if (title === "Earn") {
			await parseEarn(parsed);
		} else if (title === "Tutorial") {
			await parseEarn(parsed);
		} else {
			throw new Error("Failed to parse " + parsed[0][0]);
		}
	}
}).catch((error: Error) => {
	console.log("error: " + error.message + "\n" + error.stack);
});*/
