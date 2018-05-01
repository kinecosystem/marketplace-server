export type ApiError = {
	code: number;
	error: string;
	message: string;
};

/**
 * Code additions (/postfix) to be added to the http status code per error.
 * The concatenation is done in the MarketplaceError ctor.
 */
const CODES = {
	Unauthorized: {
		MissingToken: 1,
		InvalidToken: 2,
		InvalidApiKey: 3,
		JwtKidMissing: 4,
		TosMissingOrOldToken: 5
	},
	NotFound: {
		App: 1,
		Offer: 2,
		Order: 3,
		PublicKey: 4,
		OfferCapReached: 5
	},
	RequestTimeout: {
		OpenOrderExpired: 1
	},
	Conflict: {
		ExternalOrderExhausted: 1
	},
	InternalServerError: {
		OpenedOrdersOnly: 1,
		OpenedOrdersUnreturnable: 2
	},
	BadRequest: {
		UnknownSignInType: 1,
		WrongJWTAlgorithm: 2,
		InvalidPollAnswers: 3
	}
};

export class MarketplaceError extends Error {
	public readonly title: string;
	public readonly status: number; // http status code
	public readonly code: number; // our own internal codes

	constructor(status: number, index: number, title: string, message: string) {
		super(message);
		this.code = Number(status + "" + index);
		this.title = title;
		this.status = status;
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
	return UnauthorizedError(CODES.Unauthorized.InvalidApiKey, `invalid api key: ${ apiKey }`);
}

export function JwtKidMissing() {
	return UnauthorizedError(CODES.Unauthorized.JwtKidMissing, "kid is missing from the JWT");
}

export function TosMissingOrOldToken() {
	return UnauthorizedError(CODES.Unauthorized.TosMissingOrOldToken, "user did not approve TOS or using a pre activated token");
}

function NotFoundError(index: number, message: string) {
	return new MarketplaceError(404, index, "Not Found", message);
}

export function NoSuchApp(id: string) {
	return NotFoundError(CODES.NotFound.App, `No such app: ${ id }`);
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

export function ExternalOrderExhausted() {
	return ConflictError(CODES.Conflict.ExternalOrderExhausted, "User already completed offer, or has a pending order");
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

export function WrongJWTAlgorithm(type: string) {
	return BadRequestError(CODES.BadRequest.UnknownSignInType, `algorithm type ("${ type }") not supported`);
}

export function InvalidPollAnswers() {
	return BadRequestError(CODES.BadRequest.InvalidPollAnswers, "submitted form is invalid");
}
