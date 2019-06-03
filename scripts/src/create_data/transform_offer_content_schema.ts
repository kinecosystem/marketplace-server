import { getConfig } from "../public/config";
import { OfferContent } from "../models/offers";
import { close as closeModels, init as initModels } from "../models";
import { Page, PageType, Poll, Quiz, Tutorial } from "../public/services/offer_contents";

getConfig();

interface RewardPage {
	rewardText: string;
	rewardValue: "${amount}";
	description: string;
	title: string;
	footerHtml: string;
}

const COMPLETE_POLL = "Finish the poll to earn";
const COMPLETE_QUIZ = "Finish the quiz to earn";
const COMPLETE_TUTORIAL = "Finish the tutorial to earn";

async function dumpOffers() {
	const offerContents = await OfferContent.find();
	for (const content of offerContents) {
		if (content.contentType === "coupon") {
			continue;
		}
		const poll: Poll = JSON.parse(content.content);
		console.log(content.contentType);
		console.log("before:", poll);
		for (const page of poll.pages) {
			if ((page as any as Page).type === PageType.FullPageMultiChoice) {
				(page as any as RewardPage).rewardText = COMPLETE_POLL;
				(page as any as RewardPage).rewardValue = "${amount}";
				(page as any as RewardPage).description = "";
			} else if ((page as any as Page).type === PageType.TimedFullPageMultiChoice) {
				(page as any as RewardPage).rewardText = COMPLETE_QUIZ;
				(page as any as RewardPage).rewardValue = "${amount}";
				if (!(page as any as RewardPage).title) { // to be able to re-run on same data
					(page as any as RewardPage).title = (page as any as RewardPage).description;
				}
				(page as any as RewardPage).description = "";
			} else if ((page as any as Page).type === PageType.ImageAndText) {
				(page as any as RewardPage).rewardText = COMPLETE_TUTORIAL;
				(page as any as RewardPage).rewardValue = "${amount}";
				delete (page as any as RewardPage).footerHtml;
			} else if ((page as any as Page).type === PageType.EarnThankYou) {
				(page as any as RewardPage).rewardValue = "${amount}";
				(page as any as RewardPage).description = "";
			}
		}

		console.log("after:", poll);
		content.content = JSON.stringify(poll);
		await content.save();
	}
}

async function main() {
	await initModels();
	await dumpOffers();
}

main()
	.then(() => console.log("done."))
	.catch(e => console.error(e))
	.finally(closeModels);
