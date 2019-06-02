import axios, { AxiosInstance } from "axios";

const axiosRetry = require("axios-retry");

const DEFAULTS = {
	timeout: 300,
	retries: 6
};

export function getAxiosClient(options: { timeout?: number, retries?: number } = {}): AxiosInstance {
	const client = axios.create({ timeout: options.timeout || DEFAULTS.timeout });
	axiosRetry(client, { retries: options.retries || DEFAULTS.retries, retryCondition: () => true, shouldResetTimeout: true });
	return client;
}
