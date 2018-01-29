import { Router } from "express";
import { getHistory } from "../services/transactions";

export const router: Router = Router();

/**
 * get user history
 */
router.get("/", async (req, res, next) => {
	const options = {};

	try {
		const result = await getHistory(options);
		res.status(result.code || 200).send(result.data);
	} catch (err) {
		return res.status(500).send({
			status: 500,
			error: 'Server Error'
		});
	}
});
