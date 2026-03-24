/**
 * Normalize any thrown value into an Error.
 */
export function toError(error: unknown): Error {
	if (error instanceof Error) return error;
	if (typeof error === "object" && error !== null) {
		const obj = error as Record<string, unknown>;
		const message =
			(typeof obj.message === "string" ? obj.message : null) ||
			(typeof obj.error === "string" ? obj.error : null) ||
			JSON.stringify(error);
		const err = new Error(message);
		Object.assign(err, error);
		return err;
	}
	return new Error(String(error));
}
