import { Request, Router } from "express";
import {validateJWT} from "../services/users";
import { getLogger } from "../logging";

const db = null;


export const router: Router = Router();
let logger = getLogger();

export type AuthToken = {
	token: string;
	activated: boolean;
}

/**
 * sign in a user
 */
router.post("/", async (req, res, next) => {
	let {userId , appId} = validateJWT(req.body.jwt); // throws if JWT not valid // XXX test this case

	let user = await db.User.findOne({where: {app_id: appId, app_user_id: userId}});
	if (!user) {
		// new user
		user = await db.User.create({
			app_id: appId,
			app_user_id: userId,
			public_address: req.body.public_address,
		});
		// create wallet with lumens:
		// kin.sdk.createWallet(req.body.public_address);
		logger.info(`creating STELLAR wallet for new user ${user.id}`);
	} else {
		logger.info(`returning existing user ${user.id}`);
	}

	let authToken = await db.AuthToken.create({
		user_id: user.id,
		device_id: req.body.device_id,
	});

	res.status(200).send({token: authToken.token, activated: user.activated});
});

/**
 * user activates by approving TOS
 */
router.post("/me/activate", async (req: Request & { token: string }, res, next) => {
	const result = null; // activate user if not already activated and fund the account with KIN

	let token = req.token;
	let authToken = await db.AuthToken.findOne({where: {token: req.token}});
	let user = await db.User.findOne({where: {user_id: authToken.user_id}});

	if (!user.activated) {
		user.activated = true;
		authToken = await db.AuthToken.create({
			user_id: user.id,
			device_id: req.body.device_id,
		});

		// XXX we want the auth token to be some sort of encoded payload so db access isn't needed to authenticate
		// create an order for Getting Started Invisible Offer
		// order = Offers.createOrder(GETTING_STARTED_OFFER_ID)
		// order.submitEarn(); which does:
		// tx_id = kin.sdk.payTo(public_address, order.id);
		logger.info(`funding user KIN ${user.id}`);

		let tx_id = null; // XXX should I return tx_id here? // XXX should the client make a separate call to create an order and submit it like the rest of the order flows?
	} else {
		logger.info(`existing user activated ${user.id}`);
	}

	res.status(200).send({token: token, activated: user.activated});
});
