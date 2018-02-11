import { ServiceResult } from "./index";
import { SubmissionResult } from "./orders";

export interface HistoryResultData {
	transactions: Array<{
		order_id: string;
		order: SubmissionResult;
		status: "pending" | "completed" | "failed";
	}>;
}

export const getHistory = async (options): Promise<ServiceResult<HistoryResultData>> => {
	return {
		code: 200,
		data: {
			transactions: [],
		},
	};
};
