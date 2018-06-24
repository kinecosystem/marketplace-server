import * as axios from "axios";
import { getConfig } from "../config";
import { KeyMap } from "../../utils";

const config = getConfig();

export async function getJwtKeys(): Promise<KeyMap> {
	const res = await axios.default.get(`${config.internal_service}/v1/internal/jwt-keys`);
	return res.data;
}
