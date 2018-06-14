import uuid from "uuid4";
import * as axios from "axios";

import { getConfig } from "../config";
import { Common } from "./events/common";

export interface EventData {}

export class Event<T extends EventData = EventData> {
	public static common(userId: string): Common {
		return {
			user_id: userId,
			event_id: uuid(),
			platform: "Server",
			timestamp: Date.now().toString(),
			version: getConfig().commit!,
		};
	}

	private readonly data: T;

	constructor(data: T) {
		this.data = data;
	}

	public report(): Promise<void> {
		return axios.default.post(getConfig().bi_service, JSON.stringify(this.data)) as any;
	}
}
