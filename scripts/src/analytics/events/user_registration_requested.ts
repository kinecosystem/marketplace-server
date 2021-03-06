import { Event, EventData } from "../index";
import { Common, create as createCommon } from "./common";

/**
 * This file was automatically generated by json-schema-to-typescript.
 * DO NOT MODIFY IT BY HAND. Instead, modify the source JSONSchema file,
 * and run json-schema-to-typescript to regenerate this file.
 */

/**
 * Only for NEW users - only once per user_id
 */
export interface UserRegistrationRequested extends EventData {
	event_name: "user_registration_requested";
	event_type: "business";
	common: Common;
}

export function create(user_id: string, device_id: string): Event<UserRegistrationRequested> {
	return new Event<UserRegistrationRequested>({
		event_name: "user_registration_requested",
		event_type: "business",
		common: createCommon(user_id, device_id)
	});
}
