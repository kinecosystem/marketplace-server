import { JWTClaims, verify as verifyJWT } from "../jwt";
import { ExternalOrderByDifferentUser, InvalidExternalOrderJwt, MissingFieldJWT } from "../../errors";
import { getDefaultLogger as log } from "../../logging";

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

export type JWTPayload = {
	nonce?: string;
	offer: ExternalOfferPayload;
};

export type SpendPayload = JWTPayload & {
	sender: ExternalSenderPayload;
};
export type EarnPayload = JWTPayload & {
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

export async function validateExternalOrderJWT(jwt: string, appUserId: string): Promise<ExternalOrderJWT> {
	const decoded = await verifyJWT<Partial<PayToUserPayload>, "spend" | "earn" | "pay_to_user">(jwt);

	if (decoded.payload.sub !== "earn" && decoded.payload.sub !== "spend" && decoded.payload.sub !== "pay_to_user") {
		throw InvalidExternalOrderJwt();
	}

	// offer field has to exist in earn/spend/pay_to_user JWTs
	if (!decoded.payload.offer) { throw MissingFieldJWT("offer"); }

	switch (decoded.payload.sub) {
		case "spend":
			if (!decoded.payload.sender) { throw MissingFieldJWT("sender"); }
			break;

		case "earn":
			if (!decoded.payload.recipient) { throw MissingFieldJWT("recipient"); }
			break;

		case "pay_to_user":
			if (!decoded.payload.sender) { throw MissingFieldJWT("sender"); }
			if (!decoded.payload.recipient) { throw MissingFieldJWT("recipient"); }
			break;

		default: break;
	}

	if (
		(decoded.payload.sub === "spend" || decoded.payload.sub === "pay_to_user")
		&& !!decoded.payload.sender!.user_id && decoded.payload.sender!.user_id !== appUserId
	) {
		// if sender.user_id is defined and is different than current user, raise error
		throw ExternalOrderByDifferentUser(appUserId, decoded.payload.sender!.user_id || "");
	}

	if (decoded.payload.sub === "earn" && decoded.payload.recipient && decoded.payload.recipient.user_id !== appUserId) {
		// check that user_id is defined for earn and is the same as current user
		throw ExternalOrderByDifferentUser(appUserId, decoded.payload.recipient.user_id);
	}

	return decoded.payload as ExternalOrderJWT;
}
