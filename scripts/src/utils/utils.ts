import * as _path from "path";
import * as fs from "fs";
import * as crypto from "crypto";
import { promisify } from "util";

import { Express } from "express";
import { Context } from "../public/routes";

import { path } from "./path";

export interface RequestWithContext extends Express.Request {
	context?: Context;
}

export type ServerError = Error & { syscall: string; code: string; };

export type SimpleObject<T = any> = { [key: string]: T };

export function isSimpleObject(obj: any): obj is SimpleObject {
	return typeof obj === "object" && !Array.isArray(obj);
}

export type Nothing = null | undefined;

export type Mutable<T> = { -readonly [P in keyof T ]: T[P] };

export function isNothing(obj: any): obj is Nothing {
	return obj === null || obj === undefined;
}

export function random(): number;
export function random(min: number, max: number): number;

export function random<T = any>(arr: T[]): T;
export function random<T = any>(map: Map<string, T>): [string, T];
export function random<T = any>(obj: SimpleObject<T>): [string, T];

export function random(first?: number | Map<string, any> | SimpleObject | any[], second?: number): number | [string, any] | any {
	if (first instanceof Map) {
		first = Array.from(first.entries());
	} else if (isSimpleObject(first)) {
		first = Object.keys(first).map(key => [key, (first as SimpleObject)[key]]);
	}

	if (Array.isArray(first)) {
		return first[Math.floor(Math.random() * first.length)];
	}

	if (first !== undefined && second !== undefined) {
		return Math.random() * (second - (first as number)) + (first as number);
	}

	return Math.random();
}

// return a random number between min (including) and max (excluding) i.e. min <= rand() < max
export function randomInteger(min: number, max: number): number {
	min = Math.ceil(min);
	max = Math.floor(max);
	return Math.floor(Math.random() * (max - min)) + min;
}

export enum IdPrefix {
	User = "U",
	App = "A",
	Transaction = "T",
	Offer = "O",
	None = "",
}

const ID_LENGTH = 20;
const ID_CHARS = "1234567890abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

/**
 * Generating id uses cryptographic randomness
 * randomInts is an array filled with random integers 0-255
 * Every int converted into ID_CHARS place
 *
 * @param      {IdPrefix}  prefix  The id prefix
 * @return     {string}  random string of ID_LENGTH length
 */
export function generateId(prefix: IdPrefix | string = IdPrefix.None): string {
	const buffer = Buffer.alloc(ID_LENGTH);
	const randomInts = new Uint8Array(crypto.randomFillSync(buffer)); // not async function for saving existing function interface the same

	return prefix + randomInts.reduce(
		(str, int) => str + ID_CHARS[Math.trunc(int / 256 * ID_CHARS.length)], ""
	);
}

export function normalizeError(error: string | Error | any): string {
	if (isNothing(error)) {
		return "";
	}

	if (typeof error === "string") {
		return error;
	}

	if (error instanceof Error) {
		return error.message;
	}

	return error.toString();
}

export function delay(ms: number) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

export function pick<T, K extends keyof T>(obj: T, ...props: K[]): Pick<T, K> {
	const newObj = {} as Pick<T, K>;
	props.forEach(name => newObj[name] = obj[name]);
	return newObj;
}

export function removeDuplicates<T>(arr: T[]): T[] {
	return Array.from(new Set(arr));
}

export async function retry<T>(fn: () => T, predicate: (o: any) => boolean, errorMessage?: string): Promise<T> {
	for (let i = 0; i < 30; i++) {
		const obj = await fn();
		if (predicate(obj)) {
			return obj;
		}
		await delay(1000);
		console.log("retrying...");
	}
	throw new Error(errorMessage || "failed");
}

export type KeyMap = { [name: string]: { algorithm: string, key: string } };

/**
 * read all keys from a directory
 */
export function readKeysDir(dir: string): KeyMap {
	const keys: KeyMap = {};
	fs.readdirSync(path(dir)).forEach(filename => {
		if (!filename.endsWith(".pem")) {
			console.info(`readKeysDir: skipping non pem file ${filename}`);
			return;
		}
		// filename format is kin-es256_0.pem or kin-es256_0-priv.pem or es256_0-priv.pem
		const keyid = filename.replace(/-priv/, "").split(".")[0];
		const algorithm = filename.split("_")[0].toUpperCase();
		keys[keyid] = {
			algorithm,
			key: fs.readFileSync(path(_path.join(dir, filename))).toString()
		};
	});
	return keys;
}

export function readUTCDate(date: string | Date): Date {
	if (date instanceof Date) {
		return date;
	} else if (date.endsWith("Z")) {
		return new Date(date);
	}
	return new Date(date + "Z");
}

export function getAppIdFromRequest(req: RequestWithContext): string {
	return req.context && req.context.user ? req.context.user.appId : "";
}

export function capitalizeFirstLetter(str: string) {
	return str.charAt(0).toUpperCase() + str.slice(1);
}
