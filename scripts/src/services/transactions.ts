
export type Result = {
	code: number;
	data: string;
}

export const getHistory = async (options): Promise<Result> => {
	return {
		code: 200,
		data: "getHistory ok!"
	};
};
