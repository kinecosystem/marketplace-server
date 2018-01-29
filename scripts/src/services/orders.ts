
export type Result = {
	code: number;
	data: string;
}

export const cancelOrder = async (options): Promise<Result> => {
	return {
		code: 200,
		data: "cancelOrder ok!"
	};
};

export const submitOrder = async (options): Promise<Result> => {
	return {
		code: 200,
		data: "submitOrder ok!"
	};
};
