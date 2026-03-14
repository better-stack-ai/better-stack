/**
 * Normalise any thrown value into an Error.
 *
 * Handles three shapes:
 * 1. Already an Error — returned as-is.
 * 2. A plain object — message is taken from `.message`, then `.error` (API
 *    error-response shape), then JSON.stringify. All original properties are
 *    copied onto the Error via Object.assign so callers can inspect them.
 * 3. Anything else — converted via String().
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

export function getInitials(name: string | null | undefined): string {
	if (!name) return "?";
	return name
		.split(" ")
		.filter(Boolean)
		.slice(0, 2)
		.map((n) => n[0])
		.join("")
		.toUpperCase();
}
