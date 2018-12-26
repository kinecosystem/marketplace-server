import * as _path from "path";

const fromProjectRoot = _path.join.bind(path, __dirname, "../../../../");
export function path(path: string): string {
	if (path.startsWith("/")) {
		return path;
	}
	return fromProjectRoot(path);
}
