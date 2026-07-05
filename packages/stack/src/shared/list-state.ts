import { interpolate } from "./interpolate";

export type ListStateFieldType = "string" | "number" | "boolean";

export interface ListStateField<
	T extends ListStateFieldType = ListStateFieldType,
> {
	type: T;
	default: T extends "string" ? string : T extends "number" ? number : boolean;
	/**
	 * How URL history is updated when this field changes.
	 * - `"push"` (default): discrete changes (tab switch, page change) — back button undoes.
	 * - `"replace"`: rapid changes (typing in a filter) — no extra history entries.
	 */
	history?: "push" | "replace";
}

export type ListStateSchema = Record<string, ListStateField>;

export type InferListStateValue<F extends ListStateField> =
	F["type"] extends "string"
		? string
		: F["type"] extends "number"
			? number
			: boolean;

export type InferListState<S extends ListStateSchema> = {
	[K in keyof S]: InferListStateValue<S[K]>;
};

/**
 * URL query param key for a list-state field.
 * The `namespace` argument identifies the hook instance for SSR helpers but
 * does not prefix URL keys — field names are used directly (e.g. `?tab=spam`).
 */
export function listStateParamKey(
	_namespace: string,
	fieldKey: string,
): string {
	return fieldKey;
}

function parseFieldValue<F extends ListStateField>(
	field: F,
	raw: string | null,
): InferListStateValue<F> {
	if (raw == null || raw === "") {
		return field.default as InferListStateValue<F>;
	}

	switch (field.type) {
		case "number": {
			const parsed = Number(raw);
			return (
				Number.isFinite(parsed) ? parsed : field.default
			) as InferListStateValue<F>;
		}
		case "boolean":
			return (raw === "true") as InferListStateValue<F>;
		default:
			return raw as InferListStateValue<F>;
	}
}

function serializeFieldValue(value: unknown): string {
	return String(value);
}

function valuesEqual(a: unknown, b: unknown): boolean {
	return a === b;
}

/**
 * Parse list state from URL search params (SSR-safe — pass the request URL's
 * search string or a `URLSearchParams` instance).
 */
export function parseListStateFromSearchParams<S extends ListStateSchema>(
	namespace: string,
	schema: S,
	searchParams: URLSearchParams | string,
): InferListState<S> {
	const params =
		typeof searchParams === "string"
			? new URLSearchParams(searchParams)
			: searchParams;

	const state = {} as InferListState<S>;

	for (const fieldKey of Object.keys(schema) as Array<keyof S & string>) {
		const field = schema[fieldKey]!;
		const paramKey = listStateParamKey(namespace, fieldKey);
		state[fieldKey as keyof S] = parseFieldValue(
			field,
			params.get(paramKey),
		) as InferListState<S>[keyof S];
	}

	return state;
}

/**
 * Serialize list state into URL search params. Default values are omitted for
 * clean URLs.
 */
export function serializeListStateToSearchParams<S extends ListStateSchema>(
	namespace: string,
	schema: S,
	state: InferListState<S>,
	baseParams?: URLSearchParams,
): URLSearchParams {
	const params = new URLSearchParams(baseParams?.toString());

	for (const fieldKey of Object.keys(schema) as Array<keyof S & string>) {
		const field = schema[fieldKey]!;
		const paramKey = listStateParamKey(namespace, fieldKey);
		const value = state[fieldKey as keyof S];

		if (valuesEqual(value, field.default)) {
			params.delete(paramKey);
		} else {
			params.set(paramKey, serializeFieldValue(value));
		}
	}

	return params;
}

/**
 * Decide whether a list-state update should use `replace` or `push` history.
 */
export function resolveListStateHistoryMode<S extends ListStateSchema>(
	schema: S,
	updates: Partial<InferListState<S>>,
	explicit?: boolean,
): boolean {
	if (explicit !== undefined) return explicit;

	for (const fieldKey of Object.keys(updates) as Array<keyof S & string>) {
		if (schema[fieldKey]?.history === "replace") {
			return true;
		}
	}

	return false;
}

export { interpolate };
