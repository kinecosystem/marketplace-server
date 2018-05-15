export interface Paging {
	cursors: {
		after?: string;
		before?: string;
	};
	previous?: string;
	next?: string;
}
