import * as axios from "axios";

import { getConfig } from "../config";
import { normalizeError } from "../utils";
import { getDefaultLogger } from "../logging";

export interface EventData {
}

export class Event<T extends EventData = EventData> {
	private readonly data: T;

	constructor(data: T) {
		this.data = data;
	}

	public report(): Promise<void> {
		try {
			return axios.default.post(getConfig().bi_service, this.data)
				.catch(e => getDefaultLogger().warn(`failed to report to bi ${ normalizeError(e) }`, e)) as any;
		} catch (e) {
			// nothing to do
			getDefaultLogger().warn(`failed to report to bi: ${ normalizeError(e) }`, e);
			return Promise.resolve();
		}
	}
}
