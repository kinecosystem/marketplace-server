import { JWTClaims, verify as verifyJWT } from "../jwt";
import { ExternalOrderByDifferentUser, ExternalOrderByDifferentDevice, InvalidExternalOrderJwt, MissingFieldJWT } from "../../errors";

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
		throw MissingFieldJWT(key);
	}

	if (!user.user_id) {
		throw MissingFieldJWT(`${ key }.user_id`);
	}

	if (!user.title) {
		throw MissingFieldJWT(`${ key }.title`);
	}

	if (!user.description) {
		throw MissingFieldJWT(`${ key }.description`);
	}

	if (shouldHaveDeviceId && !(user as ExternalUserPayload & ExternalEngagedUserPayload).device_id) {
		throw MissingFieldJWT(`${ key }.device_id`);
	}
}

export async function validateExternalOrderJWT(jwt: string, appUserId: string, deviceId: string): Promise<ExternalOrderJWT> {
	const decoded = await verifyJWT<ExternalOrderJWT, "spend" | "earn" | "pay_to_user">(jwt);

	if (decoded.payload.sub !== "earn" && decoded.payload.sub !== "spend" && decoded.payload.sub !== "pay_to_user") {
		throw InvalidExternalOrderJwt();
	}

	// offer field has to exist in earn/spend/pay_to_user JWTs
	if (!decoded.payload.offer) { throw MissingFieldJWT("offer"); }

	switch (decoded.payload.sub) {
		case "spend":
			validateUserPayload(decoded.payload, "sender", true);
			break;

		case "earn":
			validateUserPayload(decoded.payload, "recipient", true);
			break;

		case "pay_to_user":
			validateUserPayload(decoded.payload, "sender", true);
			validateUserPayload(decoded.payload, "recipient", false);
			break;
	}

	if (isExternalSpend(decoded.payload) || isPayToUser(decoded.payload)) {
		if (decoded.payload.sender.user_id !== appUserId) {
			throw ExternalOrderByDifferentUser(appUserId, decoded.payload.sender.user_id);
		}

		if (decoded.payload.sender.device_id !== deviceId) {
			throw ExternalOrderByDifferentDevice(deviceId, decoded.payload.sender.device_id);
		}
	} else { // decoded.payload.sub === "earn"
		if (decoded.payload.recipient.user_id !== appUserId) {
			throw ExternalOrderByDifferentUser(appUserId, decoded.payload.recipient.user_id);
		}

		if (decoded.payload.recipient.device_id !== deviceId) {
			throw ExternalOrderByDifferentDevice(deviceId, decoded.payload.recipient.device_id);
		}
	}

	return decoded.payload as ExternalOrderJWT;
}
