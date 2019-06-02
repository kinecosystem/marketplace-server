import { getConfig } from "../config";
import { normalizeError } from "../utils/utils";
import { getDefaultLogger as logger } from "../logging";
import { getAxiosClient } from "../utils/axios_client";

const httpClient = getAxiosClient({ retries: 2, timeout: 500 });

export interface EventData {
}

export class Event<T extends EventData = EventData> {
	private readonly data: T;

	constructor(data: T) {
		this.data = data;
	}

	public report(): Promise<void> {
		try {
			return httpClient.post(getConfig().bi_service, this.data)
				.catch(e => logger().warn(`failed to report to bi ${ normalizeError(e) }`)) as any;
		} catch (e) {
			// nothing to do
			logger().warn(`failed to report to bi: ${ normalizeError(e) }`);
			return Promise.resolve();
		}
	}
}
