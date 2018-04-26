import * as _path from "path";

const fromProjectRoot = _path.join.bind(path, __dirname, "../../");

export type ServerError = Error & { syscall: string; code: string; };

export function path(...paths: string[]): string {
	return fromProjectRoot(...paths);
}

export function random(): number;
export function random(min: number, max: number): number;
export function random(min?: number, max?: number): number {
	if (min !== undefined && max !== undefined) {
		return Math.random() * (max - min) + min;
	}

	return Math.random();
}

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

export function generateId(prefix: IdPrefix | string = IdPrefix.None): string {
	let id = "";

	while (id.length < ID_LENGTH) {
		id += ID_CHARS[randomInteger(0, ID_CHARS.length)];
	}

	return prefix + id;
}

export function normalizeError(error: string | Error | any): string {
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
	let obj = await fn();

	for (let i = 0; i < 30; i++) {
		obj = await fn();
		if (predicate(obj)) {
			return obj;
		}
		await delay(1000);
		console.log("retrying...");
	}
	throw new Error(errorMessage || "failed");
}
