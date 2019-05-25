import * as HttpCodes from "http-status-codes";

export type ApiError = {
	code: number;
	error: string;
	message: string;
};
export type HeaderValue = number | string | string[];

/**
 * Code additions (/postfix) to be added to the http status code per error.
 * The concatenation is done in the MarketplaceError ctor.
 */
const CODES = {
	BadRequest: {
		code: HttpCodes.BAD_REQUEST, // 400
		types: {
			UnknownSignInType: 1,
			WrongJwtAlgorithm: 2,
			InvalidPollAnswers: 3,
			InvalidExternalOrderJwt: 4,
			InvalidJwtSignature: 5,
			JwtKidMissing: 6,
			MaxWalletsExceeded: 7,
			InvalidWalletAddress: 8,
			ExpiredJwt: 9,
			InvalidJwtIssuedTime: 10,
			MissingFieldJWT: 11,
			BadJWTInput: 12
		}
	},
	Unauthorized: {
		code: HttpCodes.UNAUTHORIZED, // 401
		types: {
			MissingToken: 1,
			InvalidToken: 2,
			InvalidApiKey: 3,
			TOSMissingOrOldToken: 4,
			CrossAppWallet: 5,
		}
	},
	NotFound: {
		code: HttpCodes.NOT_FOUND, // 404
		types: {
			App: 1,
			Offer: 2,
			Order: 3,
			PublicKey: 4,
			OfferCapReached: 5,
			User: 6
		}
	},
	RequestTimeout: {
		code: HttpCodes.REQUEST_TIMEOUT, // 408
		types: {
			OpenOrderExpired: 1,
		}
	},
	Conflict: {
		code: HttpCodes.CONFLICT, // 409
		types: {
			ExternalOrderAlreadyCompleted: 1,
			ExternalOrderByDifferentUser: 2,
			CompletedOrderCantTransitionToFailed: 3,
			ExternalOrderByDifferentDevice: 4,
			UserHasNoWallet: 5
		}
	},
	Gone: {
		code: HttpCodes.GONE, // 410
		types: {
			WrongBlockchainVersion: 1,
		}
	},
	TooManyRequests: {
		code: HttpCodes.TOO_MANY_REQUESTS, // 429
		types: {
			Registrations: 1,
			Amounts: 2,
			UserRequests: 3,
		}
	},
	InternalServerError: {
		code: HttpCodes.INTERNAL_SERVER_ERROR, // 500
		types: {
			OpenedOrdersOnly: 1,
			OpenedOrdersUnreturnable: 2,
		}
	},
	TransactionFailed: { // these errors aren't thrown, they are set to the order.error field
		code: 700, // 700
		types: {
			WrongSender: 1,
			WrongRecipient: 2,
			WrongAmount: 3,
			AssetUnavailable: 4,
			BlockchainError: 5,
			TransactionTimeout: 6
		}
	},
};

export class MarketplaceError extends Error {
	public readonly title: string;
	public readonly status: number; // http status code
	public readonly code: number; // our own internal codes
	public readonly headers: { [name: string]: HeaderValue };

	constructor(status: number, index: number, title: string, message: string) {
		super(message);
		this.code = Number(status + "" + index);
		this.title = title;
		this.status = status;
		this.headers = {};
	}

	public setHeader(name: string, value: HeaderValue) {
		this.headers[name] = value;
	}

	public toJson(): ApiError {
		return {
			code: this.code,
			error: this.title,
			message: this.message
		};
	}

	public toString(): string {
		return JSON.stringify(this.toJson());
	}
}

function UnauthorizedError(key: keyof typeof CODES.Unauthorized.types, message: string) {
	return new MarketplaceError(CODES.Unauthorized.code, CODES.Unauthorized.types[key], "Unauthorized Request", message);
}

export function MissingToken() {
	return UnauthorizedError("MissingToken", "Request missing token");
}

export function InvalidToken(token: string) {
	return UnauthorizedError("InvalidToken", `Invalid token: ${ token }`);
}

export function InvalidApiKey(apiKey: string) {
	return UnauthorizedError("InvalidApiKey", `Invalid api key: ${ apiKey }`);
}

export function TOSMissingOrOldToken() {
	return UnauthorizedError("TOSMissingOrOldToken", "User did not approve TOS or using a pre activated token");
}

export function CrossAppWallet(wallet: string, app: string) {
	return UnauthorizedError("CrossAppWallet", `Wallet ${wallet} does not belong to current app ${app}`);
}

function NotFoundError(key: keyof typeof CODES.NotFound.types, message: string) {
	return new MarketplaceError(CODES.NotFound.code, CODES.NotFound.types[key], "Not Found", message);
}

export function NoSuchApp(id: string) {
	return NotFoundError("App", `No such app: ${ id }`);
}

export function NoSuchUser(id: string) {
	return NotFoundError("User", `No such user: ${ id }`);
}

export function NoSuchOffer(id: string) {
	return NotFoundError("Offer", `No such offer: ${ id }`);
}

export function NoSuchOrder(id: string) {
	return NotFoundError("Order", `No such order: ${ id }`);
}

export function NoSuchPublicKey(appId: string, keyid: string) {
	return NotFoundError("App", `Key "${ keyid }" not found for iss "${ appId }"`);
}

function RequestTimeoutError(key: keyof typeof CODES.RequestTimeout.types, message: string) {
	return new MarketplaceError(CODES.RequestTimeout.code, CODES.RequestTimeout.types[key], "Request Timeout", message);
}

export function OpenOrderExpired(orderId: string) {
	return RequestTimeoutError("OpenOrderExpired", `open order ${ orderId } has expired`);
}

function ConflictError(key: keyof typeof CODES.Conflict.types, message: string) {
	return new MarketplaceError(CODES.Conflict.code, CODES.Conflict.types[key], "Conflict", message);
}

export function ExternalOrderAlreadyCompleted(orderId: string, status: string) {
	const error = ConflictError("ExternalOrderAlreadyCompleted", `Can't create order for offer. Another order is ${status}`);
	error.setHeader("Location", `/v1/orders/${ orderId }`);
	return error;
}

export function ExternalOrderByDifferentUser(loggedInUser: string, payToUser: string) {
	const message = `User (${ payToUser }) is not the logged in user (${ loggedInUser })`;
	return ConflictError("ExternalOrderByDifferentUser", message);
}

export function CompletedOrderCantTransitionToFailed() {
	const message = "cant set an error message to a completed order";
	return ConflictError("CompletedOrderCantTransitionToFailed", message);
}

export function ExternalOrderByDifferentDevice(loggedDeviceId: string, deviceId: string) {
	const message = `Device (${ deviceId }) is not the logged in device (${ loggedDeviceId })`;
	return ConflictError("ExternalOrderByDifferentUser", message);
}

export function UserHasNoWallet(userId: string, deviceId?: string) {
	let message = `No wallet was set for user ${ userId }`;
	if (deviceId) {
		message += ` for device ${ deviceId }`;
	}

	return ConflictError("UserHasNoWallet", message);
}

export function OfferCapReached(id: string) {
	return NotFoundError("OfferCapReached", `Cap reached for offer: ${ id }`);
}

function InternalServerError(key: keyof typeof CODES.InternalServerError.types, message: string) {
	return new MarketplaceError(CODES.InternalServerError.code, CODES.InternalServerError.types[key], "Internal Server Error", message);
}

export function OpenedOrdersOnly() {
	return InternalServerError("OpenedOrdersOnly", "Only opened orders should be returned");
}

export function OpenedOrdersUnreturnable() {
	return InternalServerError("OpenedOrdersUnreturnable", "Opened orders should not be returned");
}

function BadRequestError(key: keyof typeof CODES.BadRequest.types, message: string) {
	return new MarketplaceError(CODES.BadRequest.code, CODES.BadRequest.types[key], "Bad Request", message);
}

export function UnknownSignInType(type: string) {
	return BadRequestError("UnknownSignInType", `Unknown sign-in type: ${ type }`);
}

export function WrongJwtAlgorithm(type: string) {
	return BadRequestError("UnknownSignInType", `Algorithm type ("${ type }") not supported`);
}

export function InvalidJwtSignature() {
	return BadRequestError("InvalidJwtSignature", "The JWT failed to verify");
}

export function ExpiredJwt(exp: number) {
	return BadRequestError("ExpiredJwt", `The JWT 'exp' field (${ exp }) is in the past`);
}

export function InvalidJwtIssuedTime(iat: number) {
	return BadRequestError("InvalidJwtIssuedTime", `The JWT 'iat' field (${ iat }) is in the future`);
}

export function MissingFieldJWT(fieldName: string) {
	return BadRequestError("MissingFieldJWT", `The JWT ${ fieldName } field is missing`);
}

export function BadJWTInput(token: string) {
	return BadRequestError("BadJWTInput", `JWT ${ token } failed to decode`);
}

export function InvalidPollAnswers() {
	return BadRequestError("InvalidPollAnswers", "Submitted form is invalid");
}

export function InvalidExternalOrderJwt(message: string) {
	return BadRequestError("InvalidExternalOrderJwt", message);
}

export function JwtKidMissing() {
	return BadRequestError("JwtKidMissing", "kid is missing from the JWT");
}

export function MaxWalletsExceeded() {
	return BadRequestError("MaxWalletsExceeded", "No more wallet creations allowed");
}

export function InvalidWalletAddress(address: string) {
	return BadRequestError("InvalidWalletAddress", `Invalid (not 56 characters) wallet address: ${ address }`);
}

function TransactionFailed(key: keyof typeof CODES.TransactionFailed.types, message: string) {
	return new MarketplaceError(CODES.TransactionFailed.code, CODES.TransactionFailed.types[key], "Transaction Failed", message);
}

export function WrongSender() {
	return TransactionFailed("WrongSender", "Wrong Sender");
}

export function WrongRecipient() {
	return TransactionFailed("WrongRecipient", "Wrong Recipient");
}

export function WrongAmount() {
	return TransactionFailed("WrongAmount", "Wrong Amount");
}

export function AssetUnavailable() {
	return TransactionFailed("AssetUnavailable", "Unavailable Asset");
}

export function BlockchainError(message?: string) {
	message = message ? (": " + message) : "";
	return TransactionFailed("BlockchainError", "Blockchain Error: " + message);
}

export function TransactionTimeout() {
	return TransactionFailed("TransactionTimeout", "Transaction Timeout");
}

function TooManyRequests(key: keyof typeof CODES.TooManyRequests.types, message: string): MarketplaceError {
	return new MarketplaceError(CODES.TooManyRequests.code, CODES.TooManyRequests.types[key], "Too Many Requests", message);
}

export function TooManyRegistrations(message: string): MarketplaceError {
	return TooManyRequests("Registrations", message);
}

export function TooMuchEarnOrdered(message: string): MarketplaceError {
	return TooManyRequests("Amounts", message);
}

export function TooManyUserRequests(message: string): MarketplaceError {
	return TooManyRequests("UserRequests", message);
}

function DeprecationError(key: keyof typeof CODES.Gone.types, message: string): MarketplaceError {
	return new MarketplaceError(CODES.Gone.code, CODES.Gone.types[key], "Request to a deprecated resource", message);
}

export function WrongBlockchainVersion(message: string): MarketplaceError {
	return DeprecationError("WrongBlockchainVersion", message);
}
