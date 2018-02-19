import { Request, Router } from "express";
import { validateJWT, validateWhitelist, getOrCreateUserCredentials, activateUser } from "../services/users";
import { getLogger } from "../logging";
import * as db from "../models/users";

export const router: Router = Router();
const logger = getLogger();

// get a user
router.get("/", async (req, res, next) => {
	const user = await db.User.findOne({ id: req.query.id });
	res.status(200).send({ user });
});

/**
 * sign in a user,
 * allow either registration with JWT or plain userId to be checked against a whitelist from the given app
 */
router.post("/", async (req, res, next) => {
	let context: { appId: string; appUserId: string };

	if (req.body.sign_in_type === "jwt") {
		context = validateJWT(req.body.jwt);
	} else if (req.body.sign_in_type === "whitelist") {
		context = validateWhitelist(req.body.user_id, req.body.app_id);
	} else {
		throw new Error("unknown sign_in_type");
	}

	const { token, activated } = await getOrCreateUserCredentials(
			context.appUserId,
			context.appId,
			req.body.public_address,
			req.body.device_id);
	res.status(200).send({ token, activated });
});

/**
 * user activates by approving TOS
 */
router.post("/me/activate", async (req: Request & { token: string }, res, next) => {
	const { token, activated } = await activateUser(req.token);
	res.status(200).send({ token, activated });
});
