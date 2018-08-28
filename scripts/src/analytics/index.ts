import axios from "axios";
const axiosRetry = require("axios-retry");
const CircularJSON = require("circular-json");

import { getConfig } from "../config";
import { normalizeError } from "../utils";
import { getDefaultLogger } from "../logging";

const client = axios.create( { timeout: 500 });
axiosRetry(client, { retries: 2, retryCondition: () => true, shouldResetTimeout: true });

export interface EventData {
}

export class Event<T extends EventData = EventData> {
	private readonly data: T;

	constructor(data: T) {
		this.data = data;
	}

	public report(): Promise<void> {
		try {
			return client.post(getConfig().bi_service, this.data)
				.catch(e => getDefaultLogger().warn(`failed to report to bi ${ normalizeError(e) }`, e, CircularJSON.stringify(this.data))) as any;
		} catch (e) {
			// nothing to do
			getDefaultLogger().warn(`failed to report to bi: ${ normalizeError(e) }`, e);
			return Promise.resolve();
		}
	}
}
