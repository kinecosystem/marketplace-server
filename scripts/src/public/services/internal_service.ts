import { getConfig } from "../config";
import { KeyMap } from "../../utils/utils";
import { getAxiosClient } from "../../utils/axios_client";

const config = getConfig();
const httpClient = getAxiosClient({ timeout: 500 });

export async function getJwtKeys(): Promise<KeyMap> {
	const res = await httpClient.get(`${ config.internal_service }/v1/internal/jwt-keys`);
	return res.data;
}
