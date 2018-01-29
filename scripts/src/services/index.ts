export type ServiceError = {
	code: number;
	error: string;
	message?: string;
}

export type ServiceResult<Data = any> = {
	code: number;
	data?: Data;
}