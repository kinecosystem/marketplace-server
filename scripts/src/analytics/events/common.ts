import * as uuid from "uuid";
import { getConfig } from "../../config";

/**
 * common properties for all events
 */
export type Common = {
	schema_version: string;
	event_id: string;
	version: string;
	device_id: string | null;
	user_id: string;
	timestamp: string;
	platform: "iOS" | "Android" | "Web" | "Server";
};

export function create(userId: string, deviceId?: string): Common {
	return {
		schema_version: "e98699d6f5dd88a66fc3d31e368a090e7312d7a6",
		event_id: uuid(),
		version: getConfig().commit!,
		device_id: deviceId || null,
		user_id: userId,
		timestamp: Date.now().toString(),
		platform: "Server"
	};
}
