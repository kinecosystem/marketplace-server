import axios from "axios";
import { getConfig } from "../config";
import { KeyMap } from "../../utils/utils";
const axiosRetry = require("axios-retry");

const config = getConfig();
const client = axios.create( { timeout: 500 });
axiosRetry(client, { retries: 6, retryCondition: () => true, shouldResetTimeout: true });

export async function getJwtKeys(): Promise<KeyMap> {
	const res = await client.get(`${config.internal_service}/v1/internal/jwt-keys`);
	return res.data;
}
