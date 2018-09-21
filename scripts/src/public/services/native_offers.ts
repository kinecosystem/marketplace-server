import { LoggerInstance } from "winston";

import { ExternalEarnOfferByDifferentUser, InvalidExternalOrderJwt } from "../../errors";

import { JWTClaims, verify as verifyJWT } from "../jwt";
import { User } from "../../models/users";

export type ExternalOfferPayload = {
	id: string;
	amount: number;
};
export type ExternalSenderPayload = {
	user_id?: string;

	// TEMP:JID_MIGRATION
	user_jid?: string;

	title: string;
	description: string;
};
export type ExternalRecipientPayload = { user_id: string } & ExternalSenderPayload;

export type SpendPayload = {
	offer: ExternalOfferPayload;
	sender: ExternalSenderPayload;
};
export type EarnPayload = {
	offer: ExternalOfferPayload;
	recipient: ExternalRecipientPayload;
};
export type PayToUserPayload = EarnPayload & SpendPayload;

export type ExternalEarnOrderJWT = JWTClaims<"earn"> & EarnPayload;
export type ExternalSpendOrderJWT = JWTClaims<"spend"> & SpendPayload;
export type ExternalPayToUserOrderJwt = JWTClaims<"pay_to_user"> & PayToUserPayload;
export type ExternalOrderJWT = ExternalEarnOrderJWT | ExternalSpendOrderJWT | ExternalPayToUserOrderJwt;

export function isExternalEarn(jwt: ExternalOrderJWT): jwt is ExternalEarnOrderJWT {
	return jwt.sub === "earn";
}

export function isExternalSpend(jwt: ExternalOrderJWT): jwt is ExternalSpendOrderJWT {
	return jwt.sub === "spend";
}

export function isPayToUser(jwt: ExternalOrderJWT): jwt is ExternalPayToUserOrderJwt {
	return jwt.sub === "pay_to_user";
}

export async function validateExternalOrderJWT(jwt: string, user: User, logger: LoggerInstance): Promise<ExternalOrderJWT> {
	const decoded = await verifyJWT<PayToUserPayload, "spend" | "earn" | "pay_to_user">(jwt, logger);

	if (decoded.payload.sub !== "earn" && decoded.payload.sub !== "spend" && decoded.payload.sub !== "pay_to_user") {
		throw InvalidExternalOrderJwt();
	}

	// TEMP:JID_MIGRATION
	if (decoded.payload.iss === "kik") {
		const userAppId = user.appUserJid ? user.appUserId : null;
		const userAppJid = user.appUserJid ? user.appUserJid : user.appUserId;
		const decodedUserAppId = decoded.payload.sender.user_jid ? decoded.payload.sender.user_id : null;
		const decodedUserAppJid = decoded.payload.sender.user_jid ? decoded.payload.sender.user_jid : decoded.payload.sender.user_id;

		logger.info("[JID_MIGRATION] validateExternalOrderJWT\n\t\tuserAppId:" + userAppId + "\n\t\tuserAppJid: " + userAppJid + "\n\t\tdecodedUserAppId: " + decodedUserAppId + "\n\t\tdecodedUserAppJid: " + decodedUserAppJid);

		if ((decoded.payload.sub === "spend" || decoded.payload.sub === "pay_to_user")) {
			if (!!userAppId && !!decodedUserAppId && userAppId !== decodedUserAppId) {
				logger.info("[JID_MIGRATION] validateExternalOrderJWT throw 1");
				throw ExternalEarnOfferByDifferentUser(userAppId, decodedUserAppId!);
			} else if (!userAppId || (!!decodedUserAppJid && userAppJid !== decodedUserAppJid)) {
				logger.info("[JID_MIGRATION] validateExternalOrderJWT throw 2");
				throw ExternalEarnOfferByDifferentUser(userAppJid, decodedUserAppJid!);
			}
		}
	} else if ((decoded.payload.sub === "spend" || decoded.payload.sub === "pay_to_user") &&
		!!decoded.payload.sender.user_id && decoded.payload.sender.user_id !== user.appUserId) {
		// TEMP:JID_MIGRATION
		logger.info("[JID_MIGRATION] validateExternalOrderJWT throw 3");

		// if sender.user_id is defined and is different than current user, raise error
		throw ExternalEarnOfferByDifferentUser(user.appUserId, decoded.payload.sender.user_id);
	}

	if (decoded.payload.sub === "earn" && decoded.payload.recipient.user_id !== user.appUserId) {
		// TEMP:JID_MIGRATION
		logger.info("[JID_MIGRATION] validateExternalOrderJWT throw 4");

		// check that user_id is defined for earn and is the same as current user
		throw ExternalEarnOfferByDifferentUser(user.appUserId, decoded.payload.recipient.user_id);

	}

	return decoded.payload as ExternalOrderJWT;
}
