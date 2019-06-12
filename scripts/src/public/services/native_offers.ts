import { JWTClaims, verify as verifyJWT } from "../jwt";
import {
	ExternalOrderByDifferentUser,
	ExternalOrderByDifferentDevice,
	InvalidExternalOrderJwt,
	MissingField
} from "../../errors";
import { User } from "../../models/users";

export type ExternalOfferPayload = {
	id: string;
	amount: number;
};

export type ExternalEngagedUserPayload = {
	device_id: string;
};

export type ExternalUserPayload = {
	user_id: string;
	title: string;
	description: string;
};

export type JWTPayload = {
	nonce?: string;
	offer: ExternalOfferPayload;
};

export type SpendPayload = JWTPayload & {
	sender: ExternalUserPayload & ExternalEngagedUserPayload;
};

export type EarnPayload = JWTPayload & {
	recipient: ExternalUserPayload & ExternalEngagedUserPayload;
};

export type PayToUserPayload = SpendPayload & {
	recipient: ExternalUserPayload;
};

export type ExternalEarnOrderJWT = JWTClaims<"earn"> & EarnPayload;
export type ExternalSpendOrderJWT = JWTClaims<"spend"> & SpendPayload;
export type ExternalPayToUserOrderJWT = JWTClaims<"pay_to_user"> & PayToUserPayload;
export type ExternalOrderJWT = ExternalEarnOrderJWT | ExternalSpendOrderJWT | ExternalPayToUserOrderJWT;

export function isExternalEarn(jwt: ExternalOrderJWT): jwt is ExternalEarnOrderJWT {
	return jwt.sub === "earn";
}

export function isExternalSpend(jwt: ExternalOrderJWT): jwt is ExternalSpendOrderJWT {
	return jwt.sub === "spend";
}

export function isPayToUser(jwt: ExternalOrderJWT): jwt is ExternalPayToUserOrderJWT {
	return jwt.sub === "pay_to_user";
}

function validateUserPayload(data: any, key: "sender" | "recipient", shouldHaveDeviceId: boolean) {
	const user = data[key] as ExternalUserPayload | undefined;

	if (!user) {
		throw MissingField(key);
	}

	if (!user.user_id) {
		throw MissingField(`${ key }.user_id`);
	}

	if (!user.title) {
		throw MissingField(`${ key }.title`);
	}

	if (!user.description) {
		throw MissingField(`${ key }.description`);
	}

	if (shouldHaveDeviceId && !(user as ExternalUserPayload & ExternalEngagedUserPayload).device_id) {
		throw MissingField(`${ key }.device_id`);
	}
}

export async function validateExternalOrderJWT(jwt: string, user: User, deviceId: string): Promise<ExternalOrderJWT> {
	const decoded = await verifyJWT<ExternalOrderJWT, "spend" | "earn" | "pay_to_user">(jwt);

	const payload = decoded.payload;
	if (payload.sub !== "earn" && payload.sub !== "spend" && payload.sub !== "pay_to_user") {
		throw InvalidExternalOrderJwt(`Subject can be either "earn", "spend' or "pay_to_user"`);
	}

	// offer field has to exist in earn/spend/pay_to_user JWTs
	if (!payload.offer) {
		throw MissingField("offer");
	}
	if (typeof payload.offer.amount !== "number") {
		console.log("throwing");
		throw InvalidExternalOrderJwt("amount field must be a number");
	}

	if (decoded.payload.iss !== user.appId) {
		throw InvalidExternalOrderJwt("issuer must match appId");
	}

	switch (payload.sub) {
		case "spend":
			validateUserPayload(payload, "sender", true);
			break;

		case "earn":
			validateUserPayload(payload, "recipient", true);
			break;

		case "pay_to_user":
			validateUserPayload(payload, "sender", true);
			validateUserPayload(payload, "recipient", false);
			break;
	}

	if (isExternalSpend(payload) || isPayToUser(payload)) {
		if (payload.sender.user_id !== user.appUserId) {
			throw ExternalOrderByDifferentUser(user.appUserId, payload.sender.user_id);
		}

		if (payload.sender.device_id !== deviceId) {
			throw ExternalOrderByDifferentDevice(deviceId, payload.sender.device_id);
		}
	} else { // payload.sub === "earn"
		if (payload.recipient.user_id !== user.appUserId) {
			throw ExternalOrderByDifferentUser(user.appUserId, payload.recipient.user_id);
		}

		if (payload.recipient.device_id !== deviceId) {
			throw ExternalOrderByDifferentDevice(deviceId, payload.recipient.device_id);
		}
	}

	return payload as ExternalOrderJWT;
}
