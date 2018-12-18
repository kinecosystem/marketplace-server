import { Request, Response, NextFunction, RequestHandler } from "express";

import { OfferType } from "../../models/offers";
import { getDefaultLogger as log } from "../../logging";

import { getOffers as getOffersService } from "../services/offers";

/**
 * Return a list of offers
 */
export type GetOffersRequest = Request & {
	query: {
		type: OfferType
	}
};
export const getOffers = async function(req: GetOffersRequest, res: Response, next: NextFunction) {
	try {
		const data = await getOffersService(req.context.user!.id, req.context.user!.appId, req.query, req.acceptsLanguages.bind(req));
		res.status(200).send(data);
	} catch (err) {
		next(err);
	}
} as RequestHandler;
