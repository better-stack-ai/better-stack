"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { useNotify } from "../../../context";
import { SHARED_QUERY_CONFIG, toError, type StackError } from "./errors";
import { buildQueryKey, runResourceQuery, type ResourceDef } from "./queries";
import { useResourceContext, useResourceMutationForDef } from "./internal";

/** Configuration for the per-resource `useForm` hook. */
export interface ResourceFormConfig<
	TValues,
	TRecord = unknown,
	TResult = unknown,
> {
	action: "create" | "edit";
	/** Detail-query arg identifying the record to edit (e.g. a slug or id) */
	id?: unknown;
	/** Query used to fetch the record for edit (default `"detail"`) */
	detailQuery?: string;
	/** Mutation used on create submit (default `"create"`) */
	createMutation?: string;
	/** Mutation used on edit submit (default `"update"`) */
	updateMutation?: string;
	/**
	 * Externally supplied record — skips the internal detail fetch. Useful
	 * when the record comes from a suspense hook higher in the tree.
	 */
	record?: TRecord | null;
	/** Default form values, or a function deriving them from the record */
	defaults?: TValues | ((record: TRecord | null) => TValues);
	/** Maps form values to create-mutation variables (default: identity) */
	toCreateVars?: (values: TValues) => unknown;
	/** Maps form values to update-mutation variables (default: identity) */
	toUpdateVars?: (values: TValues, record: TRecord | null) => unknown;
	/** Success notification, sent through the `notify` provider */
	successMessage?:
		| string
		| ((result: TResult, action: "create" | "edit") => string);
	/**
	 * Error notification for non-field errors. Field-level validation errors
	 * land on `fieldErrors` instead of producing a notification.
	 */
	errorMessage?: string | ((error: StackError) => string);
	/**
	 * Path to navigate to after success (via the router adapter's
	 * `navigate`). A function form derives it from the result; return a
	 * falsy value to skip navigation.
	 */
	redirect?:
		| string
		| ((
				result: TResult,
				action: "create" | "edit",
		  ) => string | false | null | undefined);
	/** Called after a successful submit (before redirect) */
	onSuccess?: (result: TResult) => void | Promise<void>;
}

/** Result of the per-resource `useForm` hook. */
export interface ResourceFormResult<
	TValues,
	TRecord = unknown,
	TResult = unknown,
> {
	action: "create" | "edit";
	/** The record being edited (null while loading or when creating) */
	record: TRecord | null;
	isLoadingRecord: boolean;
	recordError: Error | null;
	/** Resolved default values (stable while `record` is unchanged) */
	defaultValues: TValues | undefined;
	/** Runs the right mutation; resolves the result, or undefined on error */
	submit: (values: TValues) => Promise<TResult | undefined>;
	isSubmitting: boolean;
	/** Last submit error (normalized), or null */
	error: StackError | null;
	/** Field name → validation message(s) from the last submit error */
	fieldErrors: Record<string, string | string[]>;
	clearErrors: () => void;
}

/**
 * Builds the per-resource `useForm` hook: bundles the create/edit lifecycle —
 * fetch record for edit, defaults, submit the right mutation, invalidate,
 * notify, redirect, and per-field error state from `StackError.errors`.
 */
export function createUseForm(
	plugin: string,
	resourceName: string,
	resource: ResourceDef,
) {
	return function useForm<TValues, TRecord = unknown, TResult = unknown>(
		config: ResourceFormConfig<TValues, TRecord, TResult>,
	): ResourceFormResult<TValues, TRecord, TResult> {
		const context = useResourceContext(plugin);
		const notify = useNotify();
		const { action } = config;

		// --- record fetch (edit) ---------------------------------------------
		const detailName = config.detailQuery ?? "detail";
		const detailDef = resource.queries[detailName];
		const hasExternalRecord = config.record !== undefined;
		const detailArgs = config.id !== undefined ? [config.id] : [];
		const detailEnabled =
			action === "edit" &&
			!hasExternalRecord &&
			config.id !== undefined &&
			!!detailDef;

		const recordQuery = useQuery<unknown, Error>({
			queryKey: detailDef
				? buildQueryKey(resourceName, detailName, detailDef, detailArgs)
				: [resourceName, detailName],
			queryFn: () => {
				if (!detailDef) {
					// Unreachable: the query is disabled when detailDef is missing
					throw new Error(
						`Resource "${resourceName}" has no "${detailName}" query declared`,
					);
				}
				return runResourceQuery(
					context.client,
					detailDef,
					detailArgs,
					undefined,
					context.headers,
				);
			},
			...SHARED_QUERY_CONFIG,
			enabled: detailEnabled,
		});

		const record = hasExternalRecord
			? (config.record ?? null)
			: ((recordQuery.data as TRecord | undefined) ?? null);

		// --- defaults ----------------------------------------------------------
		const defaultsRef = useRef(config.defaults);
		defaultsRef.current = config.defaults;
		const defaultValues = useMemo(() => {
			const defaults = defaultsRef.current;
			if (typeof defaults === "function") {
				return (defaults as (record: TRecord | null) => TValues)(record);
			}
			return defaults;
			// The defaults function itself is intentionally not a dependency —
			// it is typically an inline closure; only record changes matter.
		}, [record]);

		// --- mutations ---------------------------------------------------------
		const createName = config.createMutation ?? "create";
		const updateName = config.updateMutation ?? "update";
		const createMutation = useResourceMutationForDef(
			context,
			resourceName,
			createName,
			resource,
			resource.mutations?.[createName],
		);
		const updateMutation = useResourceMutationForDef(
			context,
			resourceName,
			updateName,
			resource,
			resource.mutations?.[updateName],
		);

		// --- submit ------------------------------------------------------------
		const [error, setError] = useState<StackError | null>(null);

		const submit = async (values: TValues): Promise<TResult | undefined> => {
			setError(null);
			try {
				const isEdit = action === "edit";
				const vars = isEdit
					? config.toUpdateVars
						? config.toUpdateVars(values, record)
						: values
					: config.toCreateVars
						? config.toCreateVars(values)
						: values;
				const mutation = isEdit ? updateMutation : createMutation;
				const result = (await mutation.mutateAsync(vars)) as TResult;

				if (config.successMessage) {
					notify.success(
						typeof config.successMessage === "function"
							? config.successMessage(result, action)
							: config.successMessage,
					);
				}
				if (config.onSuccess) {
					await config.onSuccess(result);
				}
				if (config.redirect) {
					const path =
						typeof config.redirect === "function"
							? config.redirect(result, action)
							: config.redirect;
					if (path) {
						await context.navigate?.(path);
					}
				}
				return result;
			} catch (e) {
				const stackError = toError(e);
				setError(stackError);
				// Field-level validation errors land on fieldErrors, not a toast
				if (!stackError.errors && config.errorMessage) {
					notify.error(
						typeof config.errorMessage === "function"
							? config.errorMessage(stackError)
							: config.errorMessage,
					);
				}
				return undefined;
			}
		};

		const fieldErrors = useMemo(() => error?.errors ?? {}, [error]);

		return {
			action,
			record,
			isLoadingRecord: detailEnabled ? recordQuery.isLoading : false,
			recordError: detailEnabled ? recordQuery.error : null,
			defaultValues,
			submit,
			isSubmitting: createMutation.isPending || updateMutation.isPending,
			error,
			fieldErrors,
			clearErrors: () => setError(null),
		};
	};
}
