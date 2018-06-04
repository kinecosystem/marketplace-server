import { JWTClaims, verify as verifyJWT } from "../jwt";
import { ExternalEarnOfferByDifferentUser, InvalidExternalOrderJwt } from "../../errors";
import { LoggerInstance } from "winston";

export type ExternalOfferPayload = {
	id: string;
	amount: number;
};
export type ExternalSenderPayload = {
	user_id?: string;
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
export type ExternalOrderJWT = ExternalEarnOrderJWT | ExternalSpendOrderJWT;

export async function validateExternalOrderJWT(jwt: string, appUserId: string, logger: LoggerInstance): Promise<ExternalOrderJWT> {
	const decoded = await verifyJWT<PayToUserPayload, "spend" | "earn" | "pay_to_user">(jwt, logger);

	if (decoded.payload.sub !== "earn" && decoded.payload.sub !== "spend" && decoded.payload.sub !== "pay_to_user") {
		throw InvalidExternalOrderJwt();
	}

	if ((decoded.payload.sub === "spend" || decoded.payload.sub === "pay_to_user") &&
		!!decoded.payload.sender.user_id && decoded.payload.sender.user_id !== appUserId) {
		// if sender.user_id is defined and is different than current user, raise error
		throw ExternalEarnOfferByDifferentUser(appUserId, decoded.payload.sender.user_id);
	}

	if (decoded.payload.sub === "earn" && decoded.payload.recipient.user_id !== appUserId) {
		// check that user_id is defined for earn and is the same as current user
		throw ExternalEarnOfferByDifferentUser(appUserId, decoded.payload.recipient.user_id);

	}

	return decoded.payload as ExternalOrderJWT;
}
