import axios from "axios";
import { getConfig } from "../config";
import { KeyMap } from "../../utils";
const axiosRetry = require("axios-retry");

const config = getConfig();
const client = axios.create( { timeout: 1000 });
axiosRetry(client, { retries: 3 }); // retries on 5xx errors

export async function getJwtKeys(): Promise<KeyMap> {
	const res = await client.get(`${config.internal_service}/v1/internal/jwt-keys`);
	return res.data;
}
