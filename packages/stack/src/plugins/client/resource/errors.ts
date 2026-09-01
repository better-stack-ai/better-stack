/**
 * Shared error contract and React Query config for all data plugins.
 *
 * Every plugin used to copy-paste `isErrorResponse` / `toError` /
 * `SHARED_QUERY_CONFIG` into its own `query-keys.ts` / hooks files. These now
 * live in core and are exported once from `@btst/stack/plugins/client`.
 */

/**
 * Standardized error shape thrown by resource queries and mutations.
 *
 * `errors` maps field names to validation message(s), preserving Zod
 * field-level issues from better-call endpoint validation errors so form
 * hooks can map them onto per-field error state.
 */
export interface StackError extends Error {
	statusCode?: number;
	errors?: Record<string, string | string[]>;
}

/**
 * Shared React Query configuration for all plugin queries.
 * Prevents automatic refetching to avoid hydration mismatches in SSR.
 */
export const SHARED_QUERY_CONFIG = {
	retry: false,
	refetchOnWindowFocus: false,
	refetchOnMount: false,
	refetchOnReconnect: false,
	staleTime: 1000 * 60 * 5, // 5 minutes
	gcTime: 1000 * 60 * 10, // 10 minutes
} as const;

/**
 * Type guard for better-call error responses.
 * better-call client returns `Error$1<unknown> | Data<T>` — we check if
 * `error` exists and is not null/undefined to determine it's an error response.
 */
export function isErrorResponse(
	response: unknown,
): response is { error: unknown; data?: never } {
	return (
		typeof response === "object" &&
		response !== null &&
		"error" in response &&
		response.error !== null &&
		response.error !== undefined
	);
}

/** Serialized validation issue shape included in better-call 400 responses. */
interface SerializedIssue {
	path?: Array<string | number | { key: string | number }>;
	message?: string;
}

function issuePathToFieldName(issue: SerializedIssue): string {
	const path = Array.isArray(issue.path) ? issue.path : [];
	return path
		.map((segment) =>
			typeof segment === "object" && segment !== null
				? String(segment.key)
				: String(segment),
		)
		.join(".");
}

/**
 * Converts a validation `issues` array into a field-name → message(s) map.
 * Issues without a path are skipped — they only contribute to the top-level
 * error message.
 */
function issuesToFieldErrors(
	issues: unknown,
): Record<string, string | string[]> | undefined {
	if (!Array.isArray(issues) || issues.length === 0) return undefined;

	const fieldErrors: Record<string, string[]> = {};
	for (const issue of issues as SerializedIssue[]) {
		if (typeof issue !== "object" || issue === null) continue;
		const field = issuePathToFieldName(issue);
		if (!field || typeof issue.message !== "string") continue;
		(fieldErrors[field] ??= []).push(issue.message);
	}

	const entries = Object.entries(fieldErrors);
	if (entries.length === 0) return undefined;

	return Object.fromEntries(
		entries.map(([field, messages]) => [
			field,
			messages.length === 1 ? messages[0]! : messages,
		]),
	);
}

function isFieldErrorRecord(
	value: unknown,
): value is Record<string, string | string[]> {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		return false;
	}
	return Object.values(value).every(
		(v) =>
			typeof v === "string" ||
			(Array.isArray(v) && v.every((m) => typeof m === "string")),
	);
}

/**
 * Converts an unknown error (typically a better-call / better-fetch error
 * response body) into a proper `StackError` with a meaningful message.
 *
 * Normalizes to `{ message, statusCode?, errors? }` where `errors` maps
 * field names to validation messages (preserved from Zod issues in
 * better-call endpoint validation error responses).
 */
export function toError(error: unknown): StackError {
	if (error instanceof Error) {
		return error as StackError;
	}

	// Handle object errors (likely from better-call APIError response bodies)
	if (typeof error === "object" && error !== null) {
		const errorObj = error as Record<string, unknown>;
		const message =
			(typeof errorObj.message === "string" ? errorObj.message : null) ||
			(typeof errorObj.error === "string" ? errorObj.error : null) ||
			JSON.stringify(error);

		const err = new Error(message) as StackError;
		// Preserve other properties (status, code, etc.)
		Object.assign(err, error);

		const statusCode =
			typeof errorObj.statusCode === "number"
				? errorObj.statusCode
				: typeof errorObj.status === "number"
					? errorObj.status
					: undefined;
		if (statusCode !== undefined) {
			err.statusCode = statusCode;
		}

		const fieldErrors = isFieldErrorRecord(errorObj.errors)
			? errorObj.errors
			: issuesToFieldErrors(errorObj.issues);
		if (fieldErrors) {
			err.errors = fieldErrors;
		} else {
			// Object.assign may have copied a non-conforming `errors` property
			err.errors = undefined;
		}

		return err;
	}

	// Fallback for primitive values
	return new Error(String(error));
}
