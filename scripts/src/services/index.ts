export interface ServiceError {
	code: number;
	error: string;
	message?: string;
}

export interface ServiceResult<Data = any> {
	code: number;
	data?: Data;
}
