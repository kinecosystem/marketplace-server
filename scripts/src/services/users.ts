import * as jsonwebtoken from "jsonwebtoken";

type JWTClaims = {
	iss: string; // issuer
	exp: number; // expiration
	iat: number; // issued at
	sub: string; // subject
}

type JWTContent = {
	header: {
		typ: string;
		alg: string;
		key: string;
	};
	payload: JWTClaims & {
		// custom claims
		user_id: string;
	};
	signature: string;
}

function getApplicationPublicKey(application_id: string, key_id: string) {
	// return the public key for the given application.
	// an application might have multiple keys. each key identified by key_id.

	const publicKeys = {
		fancy: {1: "sdfnksdjfhlskjfhksdf", 2: "23423423423423"},
		kik: {one: "-----BEGIN PUBLIC KEY-----\n" +
			"MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDdlatRjRjogo3WojgGHFHYLugdUWAY9iR3fy4arWNA1KoS8kVw33cJibXr8bvwUAUparCwlvdbH6dvEOfou0/gCFQsHUfQrSDv+MuSUMAe8jzKE4qW+jK+xQU9a03GUnKHkkle+Q0pX/g6jXZ7r1/xAK5Do2kQ+X5xK9cipRgEKwIDAQAB\n" +
			"-----END PUBLIC KEY-----"}};

	return publicKeys[application_id][key_id];
}

export function validateJWT(jwt: string): {userId: string, appId: string} {

	/*
	eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCIsImtleSI6Im9uZSJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiYWRtaW4iOnRydWV9.vofJHXe4d0AEUxzDoqGRH7RgCTSvIbj1uYv76-jOTHjmmQE5q2YkWvQa_kfTtwsa8-xDRIsoMoZHNc6vQraUyiHMmFd6Leyv1Gb5K2NdB10aiztAlu3Z4iBZLgeBeqqaD6nvfYNJdwPtNspN9AESJBG0XBnDkeA2srrjAgHWn7s
	 */
	const decoded = jsonwebtoken.decode(jwt, {complete: true}) as JWTContent;
	const publicKey = getApplicationPublicKey(decoded.payload.iss, decoded.header.key);

	jsonwebtoken.verify(jwt, publicKey);

	return {
		userId: decoded.payload.user_id,
		appId: decoded.payload.iss,
	};
}

function getUser(userId: string) {
	return;
}