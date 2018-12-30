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
	Unauthorized: {
		MissingToken: 1,
		InvalidToken: 2,
		InvalidApiKey: 3,
		TOSMissingOrOldToken: 4,
	},
	NotFound: {
		App: 1,
		Offer: 2,
		Order: 3,
		PublicKey: 4,
		OfferCapReached: 5,
		User: 6
	},
	RequestTimeout: {
		OpenOrderExpired: 1,
	},
	Conflict: {
		ExternalOrderAlreadyCompleted: 1,
		ExternalOrderByDifferentUser: 2,
		CompletedOrderCantTransitionToFailed: 3,
		ExternalOrderByDifferentDevice: 4
	},
	InternalServerError: {
		OpenedOrdersOnly: 1,
		OpenedOrdersUnreturnable: 2,
	},
	BadRequest: {
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
	},
	TransactionFailed: {
		WrongSender: 1,
		WrongRecipient: 2,
		WrongAmount: 3,
		AssetUnavailable: 4,
		BlockchainError: 5,
		TransactionTimeout: 6,
		UserHasNoWallet: 7
	},
	TooManyRequests: {
		Registrations: 1,
		Amounts: 2
	}
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

function UnauthorizedError(index: number, message: string) {
	return new MarketplaceError(401, index, "Unauthorized Request", message);
}

export function MissingToken() {
	return UnauthorizedError(CODES.Unauthorized.MissingToken, "Request missing token");
}

export function InvalidToken(token: string) {
	return UnauthorizedError(CODES.Unauthorized.InvalidToken, `Invalid token: ${ token }`);
}

export function InvalidApiKey(apiKey: string) {
	return UnauthorizedError(CODES.Unauthorized.InvalidApiKey, `Invalid api key: ${ apiKey }`);
}

export function TOSMissingOrOldToken() {
	return UnauthorizedError(CODES.Unauthorized.TOSMissingOrOldToken, "User did not approve TOS or using a pre activated token");
}

function NotFoundError(index: number, message: string) {
	return new MarketplaceError(404, index, "Not Found", message);
}

export function NoSuchApp(id: string) {
	return NotFoundError(CODES.NotFound.App, `No such app: ${ id }`);
}

export function NoSuchUser(id: string) {
	return NotFoundError(CODES.NotFound.User, `No such user: ${ id }`);
}

export function NoSuchOffer(id: string) {
	return NotFoundError(CODES.NotFound.Offer, `No such offer: ${ id }`);
}

export function NoSuchOrder(id: string) {
	return NotFoundError(CODES.NotFound.Order, `No such order: ${ id }`);
}

export function NoSuchPublicKey(appId: string, keyid: string) {
	return NotFoundError(CODES.NotFound.App, `Key "${ keyid }" not found for iss "${ appId }"`);
}

function RequestTimeoutError(index: number, message: string) {
	return new MarketplaceError(408, index, "Request Timeout", message);
}

export function OpenOrderExpired(orderId: string) {
	return RequestTimeoutError(CODES.RequestTimeout.OpenOrderExpired, `open order ${ orderId } has expired`);
}

function ConflictError(index: number, message: string) {
	return new MarketplaceError(409, index, "Conflict", message);
}

export function ExternalOrderAlreadyCompleted(orderId: string) {
	const error = ConflictError(CODES.Conflict.ExternalOrderAlreadyCompleted, "User already completed offer, or has a pending order");
	error.setHeader("Location", `/v1/orders/${orderId}`);
	return error;
}

export function ExternalOrderByDifferentUser(loggedInUser: string, payToUser: string) {
	const message = `User (${ payToUser }) is not the logged in user (${ loggedInUser })`;
	return ConflictError(CODES.Conflict.ExternalOrderByDifferentUser, message);
}

export function CompletedOrderCantTransitionToFailed() {
	const message = "cant set an error message to a completed order";
	return ConflictError(CODES.Conflict.CompletedOrderCantTransitionToFailed, message);
}

export function ExternalOrderByDifferentDevice(loggedDeviceId: string, deviceId: string) {
	const message = `Device (${ deviceId }) is not the logged in device (${ loggedDeviceId })`;
	return ConflictError(CODES.Conflict.ExternalOrderByDifferentUser, message);
}

export function OfferCapReached(id: string) {
	return NotFoundError(CODES.NotFound.OfferCapReached, `Cap reached for offer: ${ id }`);
}

function InternalServerError(index: number, message: string) {
	return new MarketplaceError(500, index, "Internal Server Error", message);
}

export function OpenedOrdersOnly() {
	return InternalServerError(CODES.InternalServerError.OpenedOrdersOnly, "Only opened orders should be returned");
}

export function OpenedOrdersUnreturnable() {
	return InternalServerError(CODES.InternalServerError.OpenedOrdersUnreturnable, "Opened orders should not be returned");
}

function BadRequestError(index: number, message: string) {
	return new MarketplaceError(400, index, "Bad Request", message);
}

export function UnknownSignInType(type: string) {
	return BadRequestError(CODES.BadRequest.UnknownSignInType, `Unknown sign-in type: ${ type }`);
}

export function WrongJwtAlgorithm(type: string) {
	return BadRequestError(CODES.BadRequest.UnknownSignInType, `Algorithm type ("${ type }") not supported`);
}

export function InvalidJwtSignature() {
	return BadRequestError(CODES.BadRequest.InvalidJwtSignature, "The JWT failed to verify");
}

export function ExpiredJwt(exp: number) {
	return BadRequestError(CODES.BadRequest.ExpiredJwt, `The JWT 'exp' field (${ exp }) is in the past`);
}

export function InvalidJwtIssuedTime(iat: number) {
	return BadRequestError(CODES.BadRequest.InvalidJwtIssuedTime, `The JWT 'iat' field (${ iat }) is in the future`);
}

export function MissingFieldJWT(fieldName: string) {
	return BadRequestError(CODES.BadRequest.MissingFieldJWT, `The JWT ${ fieldName } field is missing`);
}

export function BadJWTInput(token: string) {
	return BadRequestError(CODES.BadRequest.BadJWTInput, `JWT ${token} failed to decode`);
}

export function InvalidPollAnswers() {
	return BadRequestError(CODES.BadRequest.InvalidPollAnswers, "Submitted form is invalid");
}

export function InvalidExternalOrderJwt() {
	return BadRequestError(CODES.BadRequest.InvalidExternalOrderJwt, `Subject can be either "earn" or "spend"`);
}

export function JwtKidMissing() {
	return BadRequestError(CODES.BadRequest.JwtKidMissing, "kid is missing from the JWT");
}

export function MaxWalletsExceeded() {
	return BadRequestError(CODES.BadRequest.MaxWalletsExceeded, "No more wallet creations allowed");
}

export function InvalidWalletAddress(address: string) {
	return BadRequestError(CODES.BadRequest.InvalidWalletAddress, `Invalid (not 56 characters) wallet address: ${ address }`);
}

function TransactionFailed(index: number, message: string) {
	return new MarketplaceError(700, index, "Transaction Failed", message);
}

export function WrongSender() {
	return TransactionFailed(CODES.TransactionFailed.WrongSender, "Wrong Sender");
}

export function WrongRecipient() {
	return TransactionFailed(CODES.TransactionFailed.WrongRecipient, "Wrong Recipient");
}

export function WrongAmount() {
	return TransactionFailed(CODES.TransactionFailed.WrongAmount, "Wrong Amount");
}

export function AssetUnavailable() {
	return TransactionFailed(CODES.TransactionFailed.AssetUnavailable, "Unavailable Asset");
}

export function BlockchainError(message?: string) {
	message = message ? (": " + message) : "";
	return TransactionFailed(CODES.TransactionFailed.BlockchainError, "Blockchain Error: " + message);
}

export function TransactionTimeout() {
	return TransactionFailed(CODES.TransactionFailed.TransactionTimeout, "Transaction Timeout");
}

export function UserHasNoWallet(userId: string, deviceId?: string) {
	let message = `No wallet was set for user ${ userId }`;
	if (deviceId) {
		message += ` for device ${ deviceId }`;
	}

	return TransactionFailed(CODES.TransactionFailed.UserHasNoWallet, message);
}

function TooManyRequests(index: number, message: string): MarketplaceError {
	return new MarketplaceError(429, index, "Too Many Requests", message);
}

export function TooManyRegistrations(message: string): MarketplaceError {
	return TooManyRequests(CODES.TooManyRequests.Registrations, message);
}

export function TooMuchEarnOrdered(message: string): MarketplaceError {
	return TooManyRequests(CODES.TooManyRequests.Amounts, message);
}
