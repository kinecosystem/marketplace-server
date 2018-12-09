import * as uuid from "uuid";
import { getConfig } from "../../config";

/**
 * common properties for all events
 */
export type Common = {
	schema_version: string;
	event_id: string;
	version: string;
	user_id: string;
	timestamp: string;
	platform: "iOS" | "Android" | "Web" | "Server";
};

export function create(userId: string): Common {
	return {
		schema_version: "8f20fa0048d59aca4cb0aac313729e7b8ecb1394",
		event_id: uuid(),
		version: getConfig().commit!,
		user_id: userId,
		timestamp: Date.now().toString(),
		platform: "Server"
	};
}
