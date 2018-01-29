
export type Result = {
	code: number;
	data: string;
}

export const getOffers = async (options): Promise<Result> => {
	return {
		code: 200,
		data: "getOffers ok!"
	};
};

export const createOrder = async (options): Promise<Result> => {
	return {
		code: 200,
		data: "createOrder ok!"
	};
};
