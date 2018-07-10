import { sync as uuid } from "uuid4";
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
		schema_version: "e3bca9c484fd1b7aacba4839b57baa781d9caa3b",
		event_id: uuid(),
		version: getConfig().commit!,
		user_id: userId,
		timestamp: Date.now().toString(),
		platform: "Server"
	};
}
