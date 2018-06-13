import { Application } from "../models/applications";

export async function getApplications(params: any, query: any): Promise<string> {
	const apps = await Application.find();
	let ret = "";
	for (const app of apps) {
		ret += `<div>
id:\t${app.id}\tname:\t${app.name}\tapi_key:\t${app.apiKey}\tjwt:\t${JSON.stringify(app.jwtPublicKeys)}
</div>`;
	}
	return ret;
}

export async function getApplcation(params: any, query: any): Promise<string> {
	return "2";
}

export async function getOffers(params: any, query: any): Promise<string> {
	return "3";
}

export async function getOffer(params: any, query: any): Promise<string> {
	return "";
}

export async function getOfferStats(params: any, query: any): Promise<string> {
	return "";
}

export async function getUserData(params: any, query: any): Promise<string> {
	return "";
}

export async function getApplicationUserData(params: any, query: any): Promise<string> {
	return "";
}

export async function getOrder(params: any, query: any): Promise<string> {
	return "";
}

export async function getPollResults(params: any, query: any): Promise<string> {
	return "";
}

export async function fuzzySearch(params: any, query: any): Promise<string> {
	return "";
}
