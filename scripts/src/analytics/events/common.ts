/**
 * common properties for all events
 */
export type Common = {
	event_id: string;
	version: string;
	user_id: string;
	timestamp: string;
	platform: "iOS" | "Android" | "Web" | "Server";
};
