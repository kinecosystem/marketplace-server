import { Request, Router } from "express";
import { validateJWT, validateWhitelist, getOrCreateUserCredentials, activateUser } from "../services/users";
import { getLogger } from "../logging";
import * as db from "../models/users";
import { Context } from "../index";

export const router: Router = Router();
const logger = getLogger();

// get a user
router.get("/", async (req, res, next) => {
	const user = await db.User.findOne({ id: req.query.id });
	res.status(200).send({ user });
});

type SignInData = {
	sign_in_type: "whitelist" | "jwt";
	user_id: string;
	device_id: string;
	app_id: string;
	public_address: string;
	jwt?: string;
};

/**
 * sign in a user,
 * allow either registration with JWT or plain userId to be checked against a whitelist from the given app
 */
router.post("/", async (req, res, next) => {
	let context: { appId: string; appUserId: string };
	const data: SignInData = req.body;

	if (data.sign_in_type === "jwt") {
		context = validateJWT(data.jwt);
	} else if (data.sign_in_type === "whitelist") {
		context = validateWhitelist(data.user_id, data.app_id);
	} else {
		throw new Error("unknown sign_in_type: " + data.sign_in_type);
	}

	const { token, activated, expiration_date } = await getOrCreateUserCredentials(
			context.appUserId,
			context.appId,
			req.body.public_address,
			req.body.device_id);
	res.status(200).send({ token, activated, expiration_date });
});

/**
 * user activates by approving TOS
 */
router.post("/me/activate", async (req: Request & { context: Context }, res, next) => {
	const { token, activated } = await activateUser(req.context.authToken, req.context.user);
	res.status(200).send({ token, activated });
});
