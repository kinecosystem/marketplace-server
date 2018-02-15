export interface ServiceError {
	code: number;
	error: string;
	message?: string;
}

export interface ServiceResult<Data = any> {
	code: number;
	data?: Data;
}

export interface Paging {
	cursors: {
		after?: string;
		before?: string;
	};
	previous?: string;
	next?: string;
}
