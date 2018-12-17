import axios from "axios";
const axiosRetry = require("axios-retry");

import { getConfig } from "../config";
import { normalizeError } from "../utils/utils";
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
				.catch(e => getDefaultLogger().warn(`failed to report to bi ${ normalizeError(e) }`)) as any;
		} catch (e) {
			// nothing to do
			getDefaultLogger().warn(`failed to report to bi: ${ normalizeError(e) }`);
			return Promise.resolve();
		}
	}
}
