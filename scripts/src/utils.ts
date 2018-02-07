import * as _path from "path";

const fromProjectRoot = _path.join.bind(path, __dirname, "../../");

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
	None = ""
}

const ID_LENGTH = 10;
const ID_CHARS = "1234567890abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
export function generateId(prefix: IdPrefix = IdPrefix.None): string {
	let id = "";

	while (id.length < ID_LENGTH) {
		id += ID_CHARS[randomInteger(0, ID_CHARS.length)];
	}

	return prefix + id;
}