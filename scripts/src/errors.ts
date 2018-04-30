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
		InvalidToken: 2
	},
	NotFound: {
		App: 1,
		Offer: 2,
		Order: 3,
		PublicKey: 4,
		OfferCapReached: 5
	},
	Conflict: {
		ExternalOrderExhausted: 1
	},
	UnprocessableEntity: {
		OpenedOrdersOnly: 1,
		OpenedOrdersUnreturnable: 2
	},
	BadRequest: {
		UnknownSignInType: 1,
		WrongJWTAlgorithm: 2
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

function ConflictError(index: number, message: string) {
	return new MarketplaceError(409, index, "Conflict", message);
}

export function ExternalOrderExhausted() {
	return ConflictError(CODES.Conflict.ExternalOrderExhausted, "User already completed offer, or has a pending order");
}

function LockedError(index: number, message: string) {
	return new MarketplaceError(423, index, "Resource Locked", message);
}

export function OfferCapReached(id: string) {
	return LockedError(CODES.NotFound.OfferCapReached, `Cap reached for offer: ${ id }`);
}

function UnprocessableEntityError(index: number, message: string) {
	return new MarketplaceError(422, index, "Unprocessable Entity", message);
}

export function OpenedOrdersOnly() {
	return UnprocessableEntityError(CODES.UnprocessableEntity.OpenedOrdersOnly, "Only opened orders should be returned");
}

export function OpenedOrdersUnreturnable() {
	return UnprocessableEntityError(CODES.UnprocessableEntity.OpenedOrdersUnreturnable, "Opened orders should not be returned");
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
