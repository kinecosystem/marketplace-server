export function delay(ms: number) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

export type MethodDecorator = (target: any, propertyKey: string, descriptor: PropertyDescriptor) => void | PropertyDescriptor;
export type RetryOptions = Partial<{
	delay: number;
	tries: number;
	errorMessage: string;
	errorMessagePrefix: string;
	predicate: (o: any) => boolean;
}>;

export const DefaultRetryOptions = {
	tries: 25,
	delay: 1000
};

// as decorator
export function retry(options?: RetryOptions): MethodDecorator;
// as a regular function
export function retry<T>(fn: () => T, options?: RetryOptions): Promise<T>;
// implementation
export function retry() {
	if (typeof arguments[0] === "function") {
		return _retry(arguments[0], arguments[1]);
	}

	return _retryDecorator(arguments[0]);
}

async function _retry<T>(fn: () => T, options?: RetryOptions) {
	let error: Error | null = null;
	options = Object.assign({}, DefaultRetryOptions, options);

	for (let i = 0; i < options.tries!; i++) {
		let obj;
		try {
			obj = await fn();

			if (!options.predicate || options.predicate(obj)) {
				return obj;
			}
		} catch (e) {
			// thrown errors are are ignored only if a predicate was not passed
			if (options.predicate) {
				throw e;
			}

			error = e instanceof Error ? e : new Error(e.toString());
		}

		console.debug("retrying..." +
			(error === null ?
				"" :
				` (because: ${ typeof error.message === "string" ? error.message : JSON.stringify(error.message)})`));
		await delay(options.delay!);
	}

	if (error) {
		if (options.errorMessagePrefix) {
			error.message = options.errorMessagePrefix + ": " + error.message;
		}
		throw error;
	}

	throw new Error(options.errorMessage ? options.errorMessage : "failed");
}

function _retryDecorator(options?: RetryOptions) {
	return function(target: any, propertyKey: string, descriptor: PropertyDescriptor) {
		const old = descriptor.value as () => any;
		descriptor.value = async function() {
			return await _retry(old.bind(this, ...arguments), options);
		};
	};
}

export function pick<T, K extends keyof T>(obj: T, ...props: K[]): Pick<T, K> {
	const newObj = {} as Pick<T, K>;
	props.forEach(name => newObj[name] = obj[name]);
	return newObj;
}
