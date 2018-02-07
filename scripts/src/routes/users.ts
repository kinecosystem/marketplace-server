import { Router } from "express";
import {AuthToken, validateJWT} from "../services/users";
import * as db from "../models/all";

export const router: Router = Router();

export type AuthToken = {
	token: string;
	activated: boolean;
}

/**
 * sign in a user
 */
router.post("/", async (req, res, next) => {
	req.body.jwt;
	req.body.device_id;
	req.body.public_address;
	let {userId , appId} = validateJWT(req.body.jwt); // throws if JWT not valid // XXX test this case

	let user = db.Users.find({appId: appId, appUserId: userId});
	if (!user) {
		// new user
		user = db.User.create(appId, userId, req.body.public_address, /*activated = */ false);
		// create wallet with lumens:
		// kin.sdk.createWallet(req.body.public_address);
	}

	let authToken = db.AuthToken.create(user.id, req.body.device_id);

	res.status(200).send({token: authToken.token, activated: user.activated});
});

/**
 * user activates by approving TOS
 */
router.post("/me/activate", async (req, res, next) => {
	const result = null; // activate user if not already activated and fund the account with KIN 

	let token = req.token;
	let userId = db.AuthToken.find(req.token);
	let user = db.Users.find(userId);
	let deviceId = db.AuthToken.get(token).deviceId;

	if (!user.activated) {
		user.activated = true;
		token = db.AuthToken.create(user.id, deviceId); // we want the auth token to be some sort of encoded payload so db access isn't needed to authenticate
		// create an order for Getting Started Invisible Offer
		// order = Offers.createOrder(GETTING_STARTED_OFFER_ID)
		// order.submitEarn(); which does:
		// tx_id = kin.sdk.payTo(public_address, order.id);
		let tx_id = null; // XXX should I return tx_id here? // XXX should the client make a separate call to create an order and submit it like the rest of the order flows?
	}

	res.status(200).send({token: token, activated: user.activated});
});
