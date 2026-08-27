import type { DBAdapter as Adapter } from "@btst/db";
import {
	defineOperation,
	type DeepReadonly,
	type Operation,
	type OperationData,
	type OperationContext,
} from "@btst/stack/plugins/api";
import type { PermissionFactsFor } from "@btst/stack/authorization";
import { formSchemaToZod } from "@workspace/ui/lib/schema-converter";
import { z } from "zod";
import { formBuilderPermissions } from "../permissions";
import {
	createFormSchema,
	listFormsQuerySchema,
	listSubmissionsQuerySchema,
	updateFormSchema,
} from "../schemas";
import type {
	Form,
	FormBuilderBackendHooks,
	FormBuilderHookContext,
	FormBuilderOperationHookContext,
	FormInput,
	SerializedForm,
	FormSubmission,
	FormSubmissionWithForm,
	SerializedFormSubmission,
	FormUpdate,
	SubmissionHookContext,
	SubmissionListFormContext,
} from "../types";
import { extractIpAddress, extractUserAgent, slugify } from "../utils";
import {
	getAllForms,
	getFormSubmissions,
	serializeForm,
	serializeFormSubmission,
	serializeFormSubmissionWithData,
} from "./getters";

const SubmissionDataSchema = z
	.record(z.string(), z.unknown())
	.transform((value) => value as Record<string, OperationData>);

export const SubmitFormOperationInputSchema = z.object({
	slug: z.string(),
	data: SubmissionDataSchema,
});
export const UpdateFormOperationInputSchema = z.object({
	id: z.string(),
	data: updateFormSchema,
});
export const DeleteFormOperationInputSchema = z.object({ id: z.string() });
export const GetFormBySlugOperationInputSchema = z.object({ slug: z.string() });
export const GetFormByIdOperationInputSchema = z.object({ id: z.string() });
export const GetFormForUpdateOperationInputSchema = z.object({
	id: z.string(),
});
export const ListSubmissionsOperationInputSchema = z.object({
	formId: z.string(),
	query: listSubmissionsQuerySchema,
});
export const GetSubmissionOperationInputSchema = z.object({
	formId: z.string(),
	submissionId: z.string(),
});

type FormReadFacts = PermissionFactsFor<
	typeof formBuilderPermissions.form.read
>;
type FormRenderFacts = PermissionFactsFor<
	typeof formBuilderPermissions.form.render
>;
type FormUpdateFacts = PermissionFactsFor<
	typeof formBuilderPermissions.form.update
>;
type FormDeleteFacts = PermissionFactsFor<
	typeof formBuilderPermissions.form.delete
>;
type SubmissionCreateFacts = PermissionFactsFor<
	typeof formBuilderPermissions.submission.create
>;
type SubmissionReadFacts = PermissionFactsFor<
	typeof formBuilderPermissions.submission.read
>;
type SubmissionDeleteFacts = PermissionFactsFor<
	typeof formBuilderPermissions.submission.delete
>;

type SubmissionOperationData = Record<string, OperationData>;

export interface FormListOperationResult {
	readonly items: readonly SerializedForm[];
	readonly total: number;
	readonly limit?: number;
	readonly offset?: number;
}

export interface SubmissionDetailOperationResult
	extends SerializedFormSubmission {
	readonly parsedData: SubmissionOperationData | null;
}

export interface SubmissionListOperationResult {
	readonly form: SubmissionListFormContext;
	readonly items: readonly SubmissionDetailOperationResult[];
	readonly total: number;
	readonly limit?: number;
	readonly offset?: number;
}

export interface SubmitOperationResult extends SerializedFormSubmission {
	readonly form: Pick<SerializedForm, "successMessage" | "redirectUrl">;
}

export type FormBuilderOperations = {
	readonly listForms: Operation<
		typeof listFormsQuerySchema,
		typeof formBuilderPermissions.form.read,
		FormListOperationResult
	>;
	readonly getFormBySlug: Operation<
		typeof GetFormBySlugOperationInputSchema,
		typeof formBuilderPermissions.form.render,
		SerializedForm
	>;
	readonly getFormById: Operation<
		typeof GetFormByIdOperationInputSchema,
		typeof formBuilderPermissions.form.read,
		SerializedForm
	>;
	readonly getFormForUpdate: Operation<
		typeof GetFormForUpdateOperationInputSchema,
		typeof formBuilderPermissions.form.update,
		SerializedForm
	>;
	readonly createForm: Operation<
		typeof createFormSchema,
		typeof formBuilderPermissions.form.create,
		SerializedForm
	>;
	readonly updateForm: Operation<
		typeof UpdateFormOperationInputSchema,
		typeof formBuilderPermissions.form.update,
		SerializedForm
	>;
	readonly deleteForm: Operation<
		typeof DeleteFormOperationInputSchema,
		typeof formBuilderPermissions.form.delete,
		{ readonly success: true }
	>;
	readonly submitForm: Operation<
		typeof SubmitFormOperationInputSchema,
		typeof formBuilderPermissions.submission.create,
		SubmitOperationResult
	>;
	readonly listSubmissions: Operation<
		typeof ListSubmissionsOperationInputSchema,
		typeof formBuilderPermissions.submission.read,
		SubmissionListOperationResult
	>;
	readonly getSubmission: Operation<
		typeof GetSubmissionOperationInputSchema,
		typeof formBuilderPermissions.submission.read,
		SubmissionDetailOperationResult
	>;
	readonly deleteSubmission: Operation<
		typeof GetSubmissionOperationInputSchema,
		typeof formBuilderPermissions.submission.delete,
		{ readonly success: true }
	>;
};

type RequestFields = {
	readonly request?: Request;
	readonly headers?: Headers;
	readonly ipAddress?: string;
	readonly userAgent?: string;
};

/** A domain/HTTP error raised after Form Builder authorization succeeds. */
export class FormBuilderOperationError extends Error {
	readonly statusCode: number;
	readonly code: string;

	constructor(statusCode: number, message: string, code: string) {
		super(message);
		this.name = "FormBuilderOperationError";
		this.statusCode = statusCode;
		this.code = code;
	}
}

interface FormSnapshot {
	readonly id: string;
	readonly slug: string;
	readonly ownerId?: string;
	readonly status: Form["status"];
	readonly updatedAt: Date;
}

interface SubmissionSnapshot {
	readonly id: string;
	readonly formId: string;
	readonly submittedBy?: string;
	readonly submittedAt: Date;
}

interface SubmissionAuthorizationSnapshot {
	readonly form: FormSnapshot;
	readonly submission: SubmissionSnapshot;
}

type ReadAdapter = Pick<Adapter, "findOne">;
type ClaimAdapter = Pick<Adapter, "updateMany">;

function snapshotForm(form: Form): FormSnapshot {
	return {
		id: form.id,
		slug: form.slug,
		...(form.createdBy ? { ownerId: form.createdBy } : {}),
		status: form.status,
		updatedAt: form.updatedAt,
	};
}

function snapshotSubmission(submission: FormSubmission): SubmissionSnapshot {
	return {
		id: submission.id,
		formId: submission.formId,
		...(submission.submittedBy ? { submittedBy: submission.submittedBy } : {}),
		submittedAt: submission.submittedAt,
	};
}

function sameFormSnapshot(form: Form | null, expected: FormSnapshot | null) {
	if (!form || !expected) return form === null && expected === null;
	const current = snapshotForm(form);
	return (
		current.id === expected.id &&
		current.slug === expected.slug &&
		current.ownerId === expected.ownerId &&
		current.status === expected.status &&
		current.updatedAt.getTime() === expected.updatedAt.getTime()
	);
}

function sameSubmissionSnapshot(
	submission: FormSubmission | null,
	expected: SubmissionSnapshot,
) {
	if (!submission) return false;
	const current = snapshotSubmission(submission);
	return (
		current.id === expected.id &&
		current.formId === expected.formId &&
		current.submittedBy === expected.submittedBy &&
		current.submittedAt.getTime() === expected.submittedAt.getTime()
	);
}

const AFFECTED_ROW_KEYS = [
	"rowCount",
	"affectedRows",
	"rowsAffected",
	"changes",
	"numUpdatedRows",
] as const;

function hasPositiveCount(value: unknown): boolean {
	if (typeof value === "number") return Number.isFinite(value) && value > 0;
	if (typeof value === "bigint") return value > 0n;
	return false;
}

/** Normalize affected-row results across the supported adapters. */
function didAffectRow(result: unknown, expectedId: string): boolean {
	if (typeof result === "number" || typeof result === "bigint") {
		return hasPositiveCount(result);
	}
	if (!result || typeof result !== "object") return false;
	const record = result as Record<string, unknown>;
	if ("count" in record) return hasPositiveCount(record.count);
	if (Array.isArray(result)) {
		return result.length > 0 && didAffectRow(result[0], expectedId);
	}
	for (const key of AFFECTED_ROW_KEYS) {
		if (key in record) return hasPositiveCount(record[key]);
	}
	if ("meta" in record) {
		const meta = record.meta;
		return Boolean(
			meta &&
				typeof meta === "object" &&
				"changes" in meta &&
				hasPositiveCount((meta as Record<string, unknown>).changes),
		);
	}
	return record.id === expectedId;
}

function formSnapshotWhere(snapshot: FormSnapshot) {
	return [
		{ field: "id", value: snapshot.id, operator: "eq" as const },
		{ field: "slug", value: snapshot.slug, operator: "eq" as const },
		{ field: "status", value: snapshot.status, operator: "eq" as const },
		{
			field: "createdBy",
			value: snapshot.ownerId ?? null,
			operator: "eq" as const,
		},
		{
			field: "updatedAt",
			value: snapshot.updatedAt,
			operator: "eq" as const,
		},
	];
}

function submissionSnapshotWhere(snapshot: SubmissionSnapshot) {
	return [
		{ field: "id", value: snapshot.id, operator: "eq" as const },
		{ field: "formId", value: snapshot.formId, operator: "eq" as const },
		{
			field: "submittedBy",
			value: snapshot.submittedBy ?? null,
			operator: "eq" as const,
		},
		{
			field: "submittedAt",
			value: snapshot.submittedAt,
			operator: "eq" as const,
		},
	];
}

function nextSnapshotDate(previous: Date) {
	return new Date(Math.max(Date.now(), previous.getTime() + 1));
}

function requireAtomicTransactions(adapter: Adapter) {
	if (
		adapter.id === "memory" ||
		typeof adapter.options?.adapterConfig.transaction !== "function"
	) {
		throw new FormBuilderOperationError(
			500,
			"Form Builder owner-sensitive writes require an adapter with isolated transaction support.",
			"ATOMIC_TRANSACTION_REQUIRED",
		);
	}
}

async function claimFormSnapshot(
	adapter: ClaimAdapter,
	snapshot: FormSnapshot,
	stale: () => Error,
) {
	const claimedAt = nextSnapshotDate(snapshot.updatedAt);
	const matched = await adapter.updateMany({
		model: "form",
		where: formSnapshotWhere(snapshot),
		update: { updatedAt: claimedAt },
	});
	if (!didAffectRow(matched, snapshot.id)) throw stale();
	return claimedAt;
}

async function restoreFormSnapshot(
	adapter: ClaimAdapter,
	snapshot: FormSnapshot,
	claimedAt: Date,
	stale: () => Error,
) {
	const restored = await adapter.updateMany({
		model: "form",
		where: formSnapshotWhere({ ...snapshot, updatedAt: claimedAt }),
		update: { updatedAt: snapshot.updatedAt },
	});
	if (!didAffectRow(restored, snapshot.id)) throw stale();
}

async function claimSubmissionSnapshot(
	adapter: ClaimAdapter,
	snapshot: SubmissionSnapshot,
) {
	const claimedAt = nextSnapshotDate(snapshot.submittedAt);
	const matched = await adapter.updateMany({
		model: "formSubmission",
		where: submissionSnapshotWhere(snapshot),
		update: { submittedAt: claimedAt },
	});
	if (!didAffectRow(matched, snapshot.id)) throw staleSubmissionError();
	return claimedAt;
}

function staleFormError() {
	return new FormBuilderOperationError(
		409,
		"Form changed while authorization was being evaluated. Retry the operation.",
		"FORM_STATE_CHANGED",
	);
}

function staleSubmissionError() {
	return new FormBuilderOperationError(
		409,
		"Submission changed while authorization was being evaluated. Retry the operation.",
		"SUBMISSION_STATE_CHANGED",
	);
}

function formNotFoundError() {
	return new FormBuilderOperationError(404, "Form not found", "FORM_NOT_FOUND");
}

function submissionNotFoundError() {
	return new FormBuilderOperationError(
		404,
		"Submission not found",
		"SUBMISSION_NOT_FOUND",
	);
}

async function findFormById(
	adapter: ReadAdapter,
	id: string,
): Promise<Form | null> {
	return (
		(await adapter.findOne<Form>({
			model: "form",
			where: [{ field: "id", value: id, operator: "eq" as const }],
		})) ?? null
	);
}

async function findFormBySlug(
	adapter: ReadAdapter,
	slug: string,
): Promise<Form | null> {
	return (
		(await adapter.findOne<Form>({
			model: "form",
			where: [{ field: "slug", value: slug, operator: "eq" as const }],
		})) ?? null
	);
}

async function findSubmission(
	adapter: ReadAdapter,
	submissionId: string,
): Promise<FormSubmission | null> {
	return (
		(await adapter.findOne<FormSubmission>({
			model: "formSubmission",
			where: [{ field: "id", value: submissionId, operator: "eq" as const }],
		})) ?? null
	);
}

function requestFields(request: Request | undefined): RequestFields {
	if (!request) return {};
	return {
		request,
		headers: request.headers,
		...(extractIpAddress(request.headers)
			? { ipAddress: extractIpAddress(request.headers) }
			: {}),
		...(extractUserAgent(request.headers)
			? { userAgent: extractUserAgent(request.headers) }
			: {}),
	};
}

function hookContext<TInput, TFacts>(
	context: OperationContext<TInput, TFacts>,
): FormBuilderHookContext<TInput, TFacts> {
	return Object.freeze({
		...context,
		...(context.identity ? { userId: context.identity.id } : {}),
		...requestFields(context.request),
	});
}

function submissionHookContext<TInput, TFacts>(
	context: OperationContext<TInput, TFacts>,
	formSlug: string,
	formId: string,
): SubmissionHookContext<TInput, TFacts> {
	return Object.freeze({
		...hookContext(context),
		formSlug,
		formId,
	});
}

function normalizeError(error: unknown, fallback: string): Error {
	if (error instanceof Error) return error;
	return new Error(typeof error === "string" ? error : fallback, {
		cause: error,
	});
}

async function notifyError(
	hooks: FormBuilderBackendHooks | undefined,
	error: unknown,
	operation:
		| "list"
		| "get"
		| "create"
		| "update"
		| "delete"
		| "submit"
		| "listSubmissions"
		| "getSubmission"
		| "deleteSubmission",
	context: FormBuilderOperationHookContext,
) {
	try {
		await hooks?.onError?.(
			normalizeError(error, "Form Builder operation failed."),
			operation,
			context,
		);
	} catch {
		// Error hooks are observational and must not replace the operation error.
	}
}

async function runDomainHook<TResult>(
	run: () => Promise<TResult> | TResult,
	statusCode: number,
	code: string,
): Promise<TResult> {
	try {
		return await run();
	} catch (error) {
		throw new FormBuilderOperationError(
			statusCode,
			normalizeError(error, "Operation rejected").message,
			code,
		);
	}
}

function publicReadFacts(slug: string, form: Form | null): FormRenderFacts {
	return {
		slug,
		exists: form !== null,
		...(form
			? {
					formId: form.id,
					...(form.createdBy ? { ownerId: form.createdBy } : {}),
					status: form.status,
				}
			: {}),
	};
}

function recordReadFacts(id: string, form: Form | null): FormReadFacts {
	return {
		scope: "record",
		formId: id,
		exists: form !== null,
		...(form
			? {
					...(form.createdBy ? { ownerId: form.createdBy } : {}),
					status: form.status,
				}
			: {}),
	};
}

function resolvedFormFacts(form: Form): FormUpdateFacts & FormDeleteFacts {
	return {
		formId: form.id,
		...(form.createdBy ? { ownerId: form.createdBy } : {}),
		status: form.status,
	};
}

function submissionRecordFacts(
	formId: string,
	submissionId: string,
	form: Form | null,
	submission: FormSubmission | null,
): SubmissionReadFacts {
	const exists = submission?.formId === formId && form?.id === formId;
	return {
		scope: "record",
		formId,
		submissionId,
		exists,
		...(form?.createdBy ? { ownerId: form.createdBy } : {}),
		...(exists && submission?.submittedBy
			? { submittedBy: submission.submittedBy }
			: {}),
	};
}

function assertValidJsonSchema(schema: string) {
	try {
		JSON.parse(schema);
	} catch {
		throw new FormBuilderOperationError(
			400,
			"Invalid JSON Schema",
			"INVALID_FORM_SCHEMA",
		);
	}
}

function sanitizeSlug(rawSlug: string) {
	const slug = slugify(rawSlug);
	if (!slug) {
		throw new FormBuilderOperationError(
			400,
			"Invalid slug: must contain at least one alphanumeric character",
			"INVALID_SLUG",
		);
	}
	return slug;
}

function duplicateSlugError() {
	return new FormBuilderOperationError(
		409,
		"Form with this slug already exists",
		"DUPLICATE_FORM_SLUG",
	);
}

function operationForm(form: Form) {
	const serialized = serializeForm(form);
	return {
		id: serialized.id,
		name: serialized.name,
		slug: serialized.slug,
		description: serialized.description,
		schema: serialized.schema,
		successMessage: serialized.successMessage,
		redirectUrl: serialized.redirectUrl,
		status: serialized.status,
		createdBy: serialized.createdBy,
		createdAt: serialized.createdAt,
		updatedAt: serialized.updatedAt,
	};
}

function operationFormsResult(result: Awaited<ReturnType<typeof getAllForms>>) {
	return {
		items: result.items.map((form) => ({ ...form })),
		total: result.total,
		...(result.limit !== undefined ? { limit: result.limit } : {}),
		...(result.offset !== undefined ? { offset: result.offset } : {}),
	};
}

function operationJson(value: unknown): SubmissionOperationData | null {
	if (value === null) return null;
	return JSON.parse(JSON.stringify(value)) as SubmissionOperationData;
}

function operationSubmissionWithData(submission: FormSubmission) {
	const serialized = serializeFormSubmissionWithData(submission);
	return {
		id: serialized.id,
		formId: serialized.formId,
		data: serialized.data,
		submittedAt: serialized.submittedAt,
		submittedBy: serialized.submittedBy,
		ipAddress: serialized.ipAddress,
		userAgent: serialized.userAgent,
		parsedData: operationJson(serialized.parsedData),
	};
}

function operationSubmissionsResult(
	result: Awaited<ReturnType<typeof getFormSubmissions>>,
) {
	return {
		items: result.items.map((submission) => ({
			id: submission.id,
			formId: submission.formId,
			data: submission.data,
			submittedAt: submission.submittedAt,
			submittedBy: submission.submittedBy,
			ipAddress: submission.ipAddress,
			userAgent: submission.userAgent,
			parsedData: operationJson(submission.parsedData),
		})),
		total: result.total,
		...(result.limit !== undefined ? { limit: result.limit } : {}),
		...(result.offset !== undefined ? { offset: result.offset } : {}),
	};
}

function operationSubmissionFormContext(form: Form) {
	return {
		id: form.id,
		name: form.name,
		...(form.createdBy ? { createdBy: form.createdBy } : {}),
	};
}

/** Create the complete Form Builder operation inventory for every transport. */
export function createFormBuilderOperations(
	adapter: Adapter,
	hooks?: FormBuilderBackendHooks,
): FormBuilderOperations {
	const formSnapshots = new WeakMap<object, FormSnapshot | null>();
	const submissionSnapshots = new WeakMap<
		object,
		SubmissionAuthorizationSnapshot | null
	>();
	const submittedFormSnapshots = new WeakMap<object, SerializedForm>();

	const listForms = defineOperation({
		input: listFormsQuerySchema,
		permission: formBuilderPermissions.form.read,
		legacyAuthorization: () => ({
			resource: "form-builder:form",
			action: "read",
		}),
		facts: () => ({ scope: "collection" as const }),
		before: async (context) => {
			await runDomainHook(
				() => hooks?.onBeforeListForms?.(hookContext(context)),
				403,
				"LIST_FORMS_REJECTED",
			);
		},
		execute: async ({ input }) =>
			operationFormsResult(await getAllForms(adapter, input)),
		onError: ({ error, ...context }) =>
			notifyError(hooks, error, "list", hookContext(context)),
	});

	const getFormBySlug = defineOperation({
		input: GetFormBySlugOperationInputSchema,
		permission: formBuilderPermissions.form.render,
		legacyAuthorization: () => ({ public: true }),
		facts: async ({ input }) => {
			const form = await findFormBySlug(adapter, input.slug);
			formSnapshots.set(input as object, form ? snapshotForm(form) : null);
			return publicReadFacts(input.slug, form);
		},
		before: async (context) => {
			const current = await findFormBySlug(adapter, context.input.slug);
			if (
				!sameFormSnapshot(
					current,
					formSnapshots.get(context.input as object) ?? null,
				)
			) {
				throw staleFormError();
			}
			await runDomainHook(
				() =>
					hooks?.onBeforeGetForm?.(context.input.slug, hookContext(context)),
				403,
				"GET_FORM_REJECTED",
			);
		},
		execute: async (context) => {
			const form = await findFormBySlug(adapter, context.input.slug);
			if (
				!sameFormSnapshot(
					form,
					formSnapshots.get(context.input as object) ?? null,
				)
			) {
				throw staleFormError();
			}
			if (!form) throw formNotFoundError();
			return operationForm(form);
		},
		onError: ({ error, ...context }) =>
			notifyError(hooks, error, "get", hookContext(context)),
	});

	const getFormById = defineOperation({
		input: GetFormByIdOperationInputSchema,
		permission: formBuilderPermissions.form.read,
		legacyAuthorization: ({ facts }) => ({
			resource: "form-builder:form",
			action: "read",
			params: { id: facts.scope === "record" ? facts.formId : "" },
		}),
		facts: async ({ input }) => {
			const form = await findFormById(adapter, input.id);
			formSnapshots.set(input as object, form ? snapshotForm(form) : null);
			return recordReadFacts(input.id, form);
		},
		before: async (context) => {
			const current = await findFormById(adapter, context.input.id);
			if (
				!sameFormSnapshot(
					current,
					formSnapshots.get(context.input as object) ?? null,
				)
			) {
				throw staleFormError();
			}
			await runDomainHook(
				() => hooks?.onBeforeGetForm?.(context.input.id, hookContext(context)),
				403,
				"GET_FORM_REJECTED",
			);
		},
		execute: async (context) => {
			const form = await findFormById(adapter, context.input.id);
			if (
				!sameFormSnapshot(
					form,
					formSnapshots.get(context.input as object) ?? null,
				)
			) {
				throw staleFormError();
			}
			if (!form) throw formNotFoundError();
			return operationForm(form);
		},
		onError: ({ error, ...context }) =>
			notifyError(hooks, error, "get", hookContext(context)),
	});

	const getFormForUpdate = defineOperation({
		input: GetFormForUpdateOperationInputSchema,
		permission: formBuilderPermissions.form.update,
		legacyAuthorization: ({ facts }) => ({
			resource: "form-builder:form",
			action: "update",
			params: {
				id: facts.formId,
				...(facts.ownerId ? { ownerId: facts.ownerId } : {}),
				status: facts.status,
			},
		}),
		facts: async ({ input }) => {
			const form = await findFormById(adapter, input.id);
			if (!form) throw formNotFoundError();
			formSnapshots.set(input as object, snapshotForm(form));
			return resolvedFormFacts(form);
		},
		before: async (context) => {
			const current = await findFormById(adapter, context.input.id);
			if (
				!sameFormSnapshot(
					current,
					formSnapshots.get(context.input as object) ?? null,
				)
			) {
				throw staleFormError();
			}
			await runDomainHook(
				() =>
					hooks?.onBeforeGetFormForUpdate?.(
						context.input.id,
						hookContext(context),
					),
				403,
				"GET_FORM_REJECTED",
			);
		},
		execute: async (context) => {
			const form = await findFormById(adapter, context.input.id);
			if (
				!sameFormSnapshot(
					form,
					formSnapshots.get(context.input as object) ?? null,
				)
			) {
				throw staleFormError();
			}
			if (!form) throw formNotFoundError();
			return operationForm(form);
		},
		onError: ({ error, ...context }) =>
			notifyError(hooks, error, "get", hookContext(context)),
	});

	const createForm = defineOperation({
		input: createFormSchema,
		permission: formBuilderPermissions.form.create,
		legacyAuthorization: () => ({
			resource: "form-builder:form",
			action: "create",
		}),
		facts: () => undefined,
		execute: async (context) => {
			const initial: FormInput = {
				...context.input,
				slug: sanitizeSlug(context.input.slug),
				redirectUrl: context.input.redirectUrl || undefined,
				...(context.identity ? { createdBy: context.identity.id } : {}),
			};
			assertValidJsonSchema(initial.schema);
			const modified = await runDomainHook(
				async () =>
					(await hooks?.onBeforeFormCreated?.(initial, hookContext(context))) ??
					initial,
				403,
				"CREATE_FORM_REJECTED",
			);
			const formInput: FormInput = {
				...modified,
				slug: sanitizeSlug(modified.slug),
				...(context.identity ? { createdBy: context.identity.id } : {}),
			};
			assertValidJsonSchema(formInput.schema);
			return adapter.transaction(async (tx) => {
				const duplicate = await findFormBySlug(tx, formInput.slug);
				if (duplicate) throw duplicateSlugError();
				const now = new Date();
				return operationForm(
					await tx.create<Form>({
						model: "form",
						data: {
							name: formInput.name,
							slug: formInput.slug,
							description: formInput.description,
							schema: formInput.schema,
							successMessage: formInput.successMessage,
							redirectUrl: formInput.redirectUrl,
							status: formInput.status ?? "active",
							createdBy: formInput.createdBy,
							createdAt: now,
							updatedAt: now,
						},
					}),
				);
			});
		},
		after: async (context) => {
			await hooks?.onAfterFormCreated?.(context.result, hookContext(context));
		},
		onError: ({ error, ...context }) =>
			notifyError(hooks, error, "create", hookContext(context)),
	});

	const updateForm = defineOperation({
		input: UpdateFormOperationInputSchema,
		permission: formBuilderPermissions.form.update,
		legacyAuthorization: ({ facts }) => ({
			resource: "form-builder:form",
			action: "update",
			params: {
				id: facts.formId,
				...(facts.ownerId ? { ownerId: facts.ownerId } : {}),
				status: facts.status,
			},
		}),
		facts: async ({ input }) => {
			const form = await findFormById(adapter, input.id);
			if (!form) throw formNotFoundError();
			formSnapshots.set(input as object, snapshotForm(form));
			return resolvedFormFacts(form);
		},
		execute: async (context) => {
			const authorized = formSnapshots.get(context.input as object);
			if (!authorized) throw staleFormError();
			requireAtomicTransactions(adapter);
			const initial: FormUpdate = {
				...context.input.data,
				...(context.input.data.slug
					? { slug: sanitizeSlug(context.input.data.slug) }
					: {}),
			};
			if (initial.schema) assertValidJsonSchema(initial.schema);

			return adapter.transaction(async (tx) => {
				const latest = await findFormById(tx, context.input.id);
				if (!sameFormSnapshot(latest, authorized)) throw staleFormError();
				const claimedAt = await claimFormSnapshot(
					tx,
					authorized,
					staleFormError,
				);
				const modified = await runDomainHook(
					async () =>
						(await hooks?.onBeforeFormUpdated?.(
							context.input.id,
							initial,
							hookContext(context),
						)) ?? initial,
					403,
					"UPDATE_FORM_REJECTED",
				);
				const update: FormUpdate = {
					...modified,
					...(modified.slug ? { slug: sanitizeSlug(modified.slug) } : {}),
				};
				if (update.schema) assertValidJsonSchema(update.schema);
				const claimed = await findFormById(tx, authorized.id);
				if (
					!sameFormSnapshot(claimed, { ...authorized, updatedAt: claimedAt })
				) {
					throw staleFormError();
				}
				if (update.slug && update.slug !== latest?.slug) {
					const duplicate = await findFormBySlug(tx, update.slug);
					if (duplicate) throw duplicateSlugError();
				}
				const updateData: Partial<Form> = {
					updatedAt: nextSnapshotDate(claimedAt),
				};
				if (update.name !== undefined) updateData.name = update.name;
				if (update.slug !== undefined) updateData.slug = update.slug;
				if (update.description !== undefined)
					updateData.description = update.description;
				if (update.schema !== undefined) updateData.schema = update.schema;
				if (update.successMessage !== undefined)
					updateData.successMessage = update.successMessage;
				if (update.redirectUrl !== undefined)
					updateData.redirectUrl = update.redirectUrl;
				if (update.status !== undefined) updateData.status = update.status;
				const matched = await tx.updateMany({
					model: "form",
					where: formSnapshotWhere({ ...authorized, updatedAt: claimedAt }),
					update: updateData,
				});
				if (!didAffectRow(matched, authorized.id)) throw staleFormError();
				const updated = await findFormById(tx, context.input.id);
				if (!updated) throw formNotFoundError();
				return operationForm(updated);
			});
		},
		after: async (context) => {
			await hooks?.onAfterFormUpdated?.(context.result, hookContext(context));
		},
		onError: ({ error, ...context }) =>
			notifyError(hooks, error, "update", hookContext(context)),
	});

	const deleteForm = defineOperation({
		input: DeleteFormOperationInputSchema,
		permission: formBuilderPermissions.form.delete,
		legacyAuthorization: ({ facts }) => ({
			resource: "form-builder:form",
			action: "delete",
			params: {
				id: facts.formId,
				...(facts.ownerId ? { ownerId: facts.ownerId } : {}),
				status: facts.status,
			},
		}),
		facts: async ({ input }) => {
			const form = await findFormById(adapter, input.id);
			if (!form) throw formNotFoundError();
			formSnapshots.set(input as object, snapshotForm(form));
			return resolvedFormFacts(form);
		},
		execute: async (context) => {
			const authorized = formSnapshots.get(context.input as object);
			if (!authorized) throw staleFormError();
			requireAtomicTransactions(adapter);
			return adapter.transaction(async (tx) => {
				const current = await findFormById(tx, context.input.id);
				if (!sameFormSnapshot(current, authorized)) throw staleFormError();
				const claimedAt = await claimFormSnapshot(
					tx,
					authorized,
					staleFormError,
				);
				await runDomainHook(
					() =>
						hooks?.onBeforeFormDeleted?.(
							context.input.id,
							hookContext(context),
						),
					403,
					"DELETE_FORM_REJECTED",
				);
				const claimed = await findFormById(tx, authorized.id);
				if (
					!sameFormSnapshot(claimed, { ...authorized, updatedAt: claimedAt })
				) {
					throw staleFormError();
				}
				await tx.deleteMany({
					model: "formSubmission",
					where: [
						{
							field: "formId",
							value: context.input.id,
							operator: "eq" as const,
						},
					],
				});
				const deleted = await tx.deleteMany({
					model: "form",
					where: [
						{ field: "id", value: authorized.id, operator: "eq" as const },
						{ field: "updatedAt", value: claimedAt, operator: "eq" as const },
					],
				});
				if (deleted !== 1) throw staleFormError();
				return { success: true } as const;
			});
		},
		after: async (context) => {
			await hooks?.onAfterFormDeleted?.(context.input.id, hookContext(context));
		},
		onError: ({ error, ...context }) =>
			notifyError(hooks, error, "delete", hookContext(context)),
	});

	const submitForm = defineOperation({
		input: SubmitFormOperationInputSchema,
		permission: formBuilderPermissions.submission.create,
		legacyAuthorization: () => ({ public: true }),
		facts: async ({ input }) => {
			const form = await findFormBySlug(adapter, input.slug);
			formSnapshots.set(input as object, form ? snapshotForm(form) : null);
			return {
				slug: input.slug,
				exists: form !== null,
				...(form
					? {
							formId: form.id,
							...(form.createdBy ? { ownerId: form.createdBy } : {}),
							status: form.status,
						}
					: {}),
			} satisfies SubmissionCreateFacts;
		},
		execute: async (context) => {
			const authorized = formSnapshots.get(context.input as object) ?? null;
			const form = await findFormBySlug(adapter, context.input.slug);
			if (!sameFormSnapshot(form, authorized)) throw staleFormError();
			if (!form) throw formNotFoundError();
			if (!authorized) throw staleFormError();
			requireAtomicTransactions(adapter);
			if (form.status !== "active") {
				throw new FormBuilderOperationError(
					400,
					"Form is not accepting submissions",
					"FORM_NOT_ACTIVE",
				);
			}

			try {
				const jsonSchema = JSON.parse(form.schema);
				const validation = formSchemaToZod(jsonSchema).safeParse(
					context.input.data,
				);
				if (!validation.success) {
					throw new FormBuilderOperationError(
						400,
						"Validation failed",
						"SUBMISSION_VALIDATION_FAILED",
					);
				}
			} catch (error) {
				if (error instanceof FormBuilderOperationError) throw error;
				throw new FormBuilderOperationError(
					400,
					"Invalid form data",
					"INVALID_FORM_DATA",
				);
			}

			const lifecycleContext = submissionHookContext(
				context,
				form.slug,
				form.id,
			);
			const submittedData = JSON.parse(
				JSON.stringify(context.input.data),
			) as Record<string, unknown>;
			return adapter.transaction(async (tx) => {
				const current = await findFormBySlug(tx, context.input.slug);
				if (!sameFormSnapshot(current, authorized)) throw staleFormError();
				if (!current || current.status !== "active") throw staleFormError();
				const claimedAt = await claimFormSnapshot(
					tx,
					authorized,
					staleFormError,
				);
				const hookResult = await runDomainHook<Record<string, unknown> | void>(
					() =>
						hooks?.onBeforeSubmission?.(
							form.slug,
							submittedData,
							lifecycleContext,
						),
					400,
					"SUBMISSION_REJECTED",
				);
				const finalData = hookResult ?? submittedData;
				const claimed = await findFormById(tx, authorized.id);
				if (
					!sameFormSnapshot(claimed, { ...authorized, updatedAt: claimedAt }) ||
					claimed?.status !== "active"
				) {
					throw staleFormError();
				}
				const submission = await tx.create<FormSubmission>({
					model: "formSubmission",
					data: {
						formId: current.id,
						data: JSON.stringify(finalData),
						submittedAt: new Date(),
						...(context.identity ? { submittedBy: context.identity.id } : {}),
						...(lifecycleContext.ipAddress
							? { ipAddress: lifecycleContext.ipAddress }
							: {}),
						...(lifecycleContext.userAgent
							? { userAgent: lifecycleContext.userAgent }
							: {}),
					},
				});
				await restoreFormSnapshot(tx, authorized, claimedAt, staleFormError);
				const serialized = serializeFormSubmission(submission);
				const result = {
					...serialized,
					form: {
						successMessage: current.successMessage,
						redirectUrl: current.redirectUrl,
					},
				};
				submittedFormSnapshots.set(result, serializeForm(current));
				return result;
			});
		},
		after: async (context) => {
			const form = submittedFormSnapshots.get(context.result as object);
			if (!form) {
				throw new FormBuilderOperationError(
					500,
					"Submission lifecycle state is unavailable",
					"SUBMISSION_LIFECYCLE_STATE_MISSING",
				);
			}
			await hooks?.onAfterSubmission?.(
				context.result,
				form,
				submissionHookContext<
					z.infer<typeof SubmitFormOperationInputSchema>,
					SubmissionCreateFacts
				>(context, form.slug, form.id),
			);
		},
		onError: async ({ error, ...context }) => {
			const facts = context.facts as DeepReadonly<SubmissionCreateFacts>;
			const formId = facts.formId ?? "";
			const lifecycleContext = submissionHookContext<
				z.infer<typeof SubmitFormOperationInputSchema>,
				SubmissionCreateFacts
			>(context, context.input.slug, formId);
			try {
				await hooks?.onSubmissionError?.(
					normalizeError(error, "Submission failed."),
					context.input.slug,
					JSON.parse(JSON.stringify(context.input.data)) as Record<
						string,
						unknown
					>,
					lifecycleContext,
				);
			} catch {
				// Observational error hook.
			}
			await notifyError(hooks, error, "submit", lifecycleContext);
		},
	});

	const listSubmissions = defineOperation({
		input: ListSubmissionsOperationInputSchema,
		permission: formBuilderPermissions.submission.read,
		legacyAuthorization: ({ facts }) => ({
			resource: "form-builder:submission",
			action: "read",
			params: { formId: facts.formId },
		}),
		facts: async ({ input }) => {
			const form = await findFormById(adapter, input.formId);
			formSnapshots.set(input as object, form ? snapshotForm(form) : null);
			return {
				scope: "collection" as const,
				formId: input.formId,
				formExists: form !== null,
				...(form?.createdBy ? { ownerId: form.createdBy } : {}),
			};
		},
		before: async (context) => {
			const expected = formSnapshots.get(context.input as object) ?? null;
			const current = await findFormById(adapter, context.input.formId);
			if (!sameFormSnapshot(current, expected)) throw staleFormError();
			if (!current) throw formNotFoundError();
			await runDomainHook(
				() =>
					hooks?.onBeforeListSubmissions?.(
						context.input.formId,
						hookContext(context),
					),
				403,
				"LIST_SUBMISSIONS_REJECTED",
			);
		},
		execute: async (context) => {
			const expected = formSnapshots.get(context.input as object) ?? null;
			return adapter.transaction(async (tx) => {
				const before = await findFormById(tx, context.input.formId);
				if (!sameFormSnapshot(before, expected)) throw staleFormError();
				if (!before) throw formNotFoundError();
				const result = await getFormSubmissions(
					tx,
					context.input.formId,
					context.input.query,
				);
				const after = await findFormById(tx, context.input.formId);
				if (!sameFormSnapshot(after, expected)) throw staleFormError();
				if (!after) throw formNotFoundError();
				return {
					form: operationSubmissionFormContext(after),
					...operationSubmissionsResult(result),
				};
			});
		},
		onError: ({ error, ...context }) =>
			notifyError(hooks, error, "listSubmissions", hookContext(context)),
	});

	const getSubmission = defineOperation({
		input: GetSubmissionOperationInputSchema,
		permission: formBuilderPermissions.submission.read,
		legacyAuthorization: ({ facts }) => {
			if (facts.scope !== "record") {
				throw new TypeError("Submission detail requires record facts.");
			}
			return {
				resource: "form-builder:submission",
				action: "read",
				params: { formId: facts.formId, id: facts.submissionId },
			};
		},
		facts: async ({ input }) => {
			const [form, submission] = await Promise.all([
				findFormById(adapter, input.formId),
				findSubmission(adapter, input.submissionId),
			]);
			const matches = form && submission?.formId === form.id;
			submissionSnapshots.set(
				input as object,
				matches
					? {
							form: snapshotForm(form),
							submission: snapshotSubmission(submission),
						}
					: null,
			);
			return submissionRecordFacts(
				input.formId,
				input.submissionId,
				form,
				submission,
			);
		},
		before: async (context) => {
			const snapshot = submissionSnapshots.get(context.input as object);
			if (!snapshot) throw submissionNotFoundError();
			const [form, submission] = await Promise.all([
				findFormById(adapter, context.input.formId),
				findSubmission(adapter, context.input.submissionId),
			]);
			if (
				!sameFormSnapshot(form, snapshot.form) ||
				!sameSubmissionSnapshot(submission, snapshot.submission)
			) {
				throw staleSubmissionError();
			}
			await runDomainHook(
				() =>
					hooks?.onBeforeGetSubmission?.(
						context.input.submissionId,
						hookContext(context),
					),
				403,
				"GET_SUBMISSION_REJECTED",
			);
		},
		execute: async (context) => {
			const snapshot = submissionSnapshots.get(context.input as object);
			if (!snapshot) throw submissionNotFoundError();
			const submission = await adapter.findOne<FormSubmissionWithForm>({
				model: "formSubmission",
				where: [
					{
						field: "id",
						value: context.input.submissionId,
						operator: "eq" as const,
					},
				],
				join: { form: true },
			});
			if (
				!submission ||
				submission.formId !== context.input.formId ||
				!sameSubmissionSnapshot(submission, snapshot.submission) ||
				!sameFormSnapshot(submission.form ?? null, snapshot.form)
			) {
				throw staleSubmissionError();
			}
			return operationSubmissionWithData(submission);
		},
		onError: ({ error, ...context }) =>
			notifyError(hooks, error, "getSubmission", hookContext(context)),
	});

	const deleteSubmission = defineOperation({
		input: GetSubmissionOperationInputSchema,
		permission: formBuilderPermissions.submission.delete,
		legacyAuthorization: ({ facts }) => ({
			resource: "form-builder:submission",
			action: "delete",
			params: { formId: facts.formId, id: facts.submissionId },
		}),
		facts: async ({ input }) => {
			const [form, submission] = await Promise.all([
				findFormById(adapter, input.formId),
				findSubmission(adapter, input.submissionId),
			]);
			if (!form || !submission || submission.formId !== form.id) {
				throw submissionNotFoundError();
			}
			submissionSnapshots.set(input as object, {
				form: snapshotForm(form),
				submission: snapshotSubmission(submission),
			});
			return {
				formId: form.id,
				submissionId: submission.id,
				exists: true,
				...(form.createdBy ? { ownerId: form.createdBy } : {}),
				...(submission.submittedBy
					? { submittedBy: submission.submittedBy }
					: {}),
			} satisfies SubmissionDeleteFacts;
		},
		execute: async (context) => {
			const snapshot = submissionSnapshots.get(context.input as object);
			if (!snapshot) throw staleSubmissionError();
			requireAtomicTransactions(adapter);
			return adapter.transaction(async (tx) => {
				const [form, submission] = await Promise.all([
					findFormById(tx, context.input.formId),
					findSubmission(tx, context.input.submissionId),
				]);
				if (
					!sameFormSnapshot(form, snapshot.form) ||
					!sameSubmissionSnapshot(submission, snapshot.submission)
				) {
					throw staleSubmissionError();
				}
				const claimedAt = await claimFormSnapshot(
					tx,
					snapshot.form,
					staleSubmissionError,
				);
				const claimedSubmissionAt = await claimSubmissionSnapshot(
					tx,
					snapshot.submission,
				);
				await runDomainHook(
					() =>
						hooks?.onBeforeSubmissionDeleted?.(
							context.input.submissionId,
							hookContext(context),
						),
					403,
					"DELETE_SUBMISSION_REJECTED",
				);
				const [claimedForm, claimedSubmission] = await Promise.all([
					findFormById(tx, snapshot.form.id),
					findSubmission(tx, snapshot.submission.id),
				]);
				if (
					!sameFormSnapshot(claimedForm, {
						...snapshot.form,
						updatedAt: claimedAt,
					}) ||
					!sameSubmissionSnapshot(claimedSubmission, {
						...snapshot.submission,
						submittedAt: claimedSubmissionAt,
					})
				) {
					throw staleSubmissionError();
				}
				const deleted = await tx.deleteMany({
					model: "formSubmission",
					where: [
						{
							field: "id",
							value: context.input.submissionId,
							operator: "eq" as const,
						},
						{
							field: "submittedAt",
							value: claimedSubmissionAt,
							operator: "eq" as const,
						},
					],
				});
				if (deleted !== 1) throw staleSubmissionError();
				await restoreFormSnapshot(
					tx,
					snapshot.form,
					claimedAt,
					staleSubmissionError,
				);
				return { success: true } as const;
			});
		},
		after: async (context) => {
			await hooks?.onAfterSubmissionDeleted?.(
				context.input.submissionId,
				hookContext(context),
			);
		},
		onError: ({ error, ...context }) =>
			notifyError(hooks, error, "deleteSubmission", hookContext(context)),
	});

	return {
		listForms,
		getFormBySlug,
		getFormById,
		getFormForUpdate,
		createForm,
		updateForm,
		deleteForm,
		submitForm,
		listSubmissions,
		getSubmission,
		deleteSubmission,
	} as const;
}
