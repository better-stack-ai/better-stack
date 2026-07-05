import { APIError, createEndpoint as baseCreateEndpoint } from "better-call";

/**
 * Validation issue segment shapes produced by standard-schema validators
 * (better-call runs Zod through the standard-schema interface).
 */
type IssuePathSegment = PropertyKey | { key: PropertyKey };

interface StandardIssue {
	message: string;
	path?: ReadonlyArray<IssuePathSegment>;
}

/** JSON-safe issue shape included in 400 validation error response bodies. */
export interface SerializedValidationIssue {
	message: string;
	path: Array<string | number>;
}

function serializeIssues(issues: unknown): SerializedValidationIssue[] {
	if (!Array.isArray(issues)) return [];
	return (issues as StandardIssue[])
		.filter((issue) => typeof issue?.message === "string")
		.map((issue) => ({
			message: issue.message,
			path: (issue.path ?? []).map((segment) => {
				const key =
					typeof segment === "object" && segment !== null
						? segment.key
						: segment;
				return typeof key === "number" ? key : String(key);
			}),
		}));
}

/**
 * Drop-in replacement for better-call's `createEndpoint` that preserves
 * Zod field-level validation issues in error responses.
 *
 * better-call discards `ValidationError.issues` when building the default
 * 400 response (only the flattened message survives). Its `onValidationError`
 * callback runs before that default and may throw a replacement error, so we
 * inject one that re-throws the same 400 `APIError` with a JSON-safe `issues`
 * array added to the body. Clients can then map issues onto form fields (see
 * `toError` in `@btst/stack/plugins/client`).
 *
 * Endpoints that define their own `onValidationError` are left untouched.
 */
export const createEndpoint = ((
	pathOrOptions: any,
	handlerOrOptions: any,
	handlerOrNever?: any,
) => {
	const isPathForm = typeof pathOrOptions === "string";
	const options = isPathForm ? handlerOrOptions : pathOrOptions;

	const wrappedOptions =
		options && typeof options === "object" && !options.onValidationError
			? {
					...options,
					onValidationError: ({
						message,
						issues,
					}: {
						message: string;
						issues: unknown;
					}) => {
						throw new APIError(400, {
							message,
							code: "VALIDATION_ERROR",
							issues: serializeIssues(issues),
						});
					},
				}
			: options;

	return isPathForm
		? baseCreateEndpoint(pathOrOptions, wrappedOptions, handlerOrNever)
		: baseCreateEndpoint(wrappedOptions, handlerOrOptions);
}) as typeof baseCreateEndpoint;

createEndpoint.create = baseCreateEndpoint.create;
