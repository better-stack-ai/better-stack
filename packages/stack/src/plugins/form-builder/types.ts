/**
 * Form Builder Plugin Types
 *
 * Key distinction from CMS Plugin:
 * - CMS uses developer-defined Zod schemas in code
 * - Form Builder allows non-technical admins to build forms via drag-and-drop UI
 * - Forms are serialized to/from JSON Schema for storage
 */
import type { DeepReadonly } from "@btst/stack/plugins/api";
import type { PermissionFactsFor } from "@btst/stack/authorization";
import type { StackIdentity } from "@btst/stack/context";
import type { formBuilderPermissions } from "./permissions";
import type {
	CreateFormInput,
	ListFormsQuery,
	ListSubmissionsQuery,
	SubmitFormInput,
	UpdateFormInput,
} from "./schemas";

/**
 * Form stored in the database
 */
export type Form = {
	id: string;
	/** Display name for the form */
	name: string;
	/** URL-friendly slug - unique identifier for public access */
	slug: string;
	/** Optional description for admin UI */
	description?: string;
	/** JSON Schema stored as string (includes steps, fieldType, stepGroup, etc.) */
	schema: string;
	/** Optional custom success message after submission */
	successMessage?: string;
	/** Optional redirect URL after submission */
	redirectUrl?: string;
	/** Form status: active, inactive, archived */
	status: "active" | "inactive" | "archived";
	/** User who created the form */
	createdBy?: string;
	createdAt: Date;
	updatedAt: Date;
};

/**
 * Form submission stored in the database
 */
export type FormSubmission = {
	id: string;
	/** Reference to the form */
	formId: string;
	/** Submitted data as JSON string */
	data: string;
	/** Submission timestamp */
	submittedAt: Date;
	/** Optional user ID if authenticated */
	submittedBy?: string;
	/** Client IP address for rate limiting and spam protection */
	ipAddress?: string;
	/** User agent for analytics */
	userAgent?: string;
};

/**
 * Form submission with its parent form joined
 */
export type FormSubmissionWithForm = FormSubmission & {
	form?: Form;
};

/**
 * Serialized form for API responses (dates as strings)
 */
export interface SerializedForm
	extends Omit<Form, "createdAt" | "updatedAt" | "status"> {
	status: Form["status"];
	createdAt: string;
	updatedAt: string;
}

/**
 * Serialized form submission for API responses (dates as strings)
 */
export interface SerializedFormSubmission
	extends Omit<FormSubmission, "submittedAt"> {
	submittedAt: string;
}

/** Non-sensitive submission metadata returned by collection reads. */
export type SerializedFormSubmissionSummary = {
	id: string;
	formId: string;
	submittedAt: string;
	submittedBy?: string;
};

/**
 * Serialized form submission with parsed data
 */
export interface SerializedFormSubmissionWithData<
	TData = Record<string, unknown>,
> extends SerializedFormSubmission {
	/** Parsed data object (JSON.parse of data field). Null when the stored JSON is corrupted. */
	parsedData: TData | null;
	/** Joined form */
	form?: SerializedForm;
}

/**
 * Paginated list response for forms
 */
export interface PaginatedForms {
	items: SerializedForm[];
	total: number;
	limit: number;
	offset: number;
}

/** Minimal form context carried by the submission-read response. */
export interface SubmissionListFormContext {
	id: string;
	name: string;
	createdBy?: string;
}

/**
 * Paginated list response for form submissions
 */
export interface PaginatedFormSubmissions {
	/** Authoritative form facts returned by the submission-read operation. */
	form: SubmissionListFormContext | null;
	/** Metadata only. Fetch an individual submission to read its contents. */
	items: SerializedFormSubmissionSummary[];
	total: number;
	limit: number;
	offset: number;
}

// ============================================================================
// BACKEND HOOKS
// ============================================================================

/**
 * Context passed to all backend hooks
 */
export interface FormBuilderHookContext<TInput = unknown, TFacts = unknown> {
	/** Validated operation input. */
	readonly input: DeepReadonly<TInput>;
	/** Trusted facts derived by the backend before authorization. */
	readonly facts: DeepReadonly<TFacts>;
	/** Authorized request identity, or `null` for anonymous/trusted execution. */
	readonly identity: DeepReadonly<StackIdentity> | null;
	/** Request when invoked through HTTP or `forRequest()`. */
	readonly request?: Request;
	/** User ID if authenticated */
	readonly userId?: string;
	/** Request headers */
	readonly headers?: Headers;
	/** Client IP address (for rate limiting) */
	readonly ipAddress?: string;
	/** User agent string */
	readonly userAgent?: string;
}

/**
 * Context for submission-specific hooks
 */
export interface SubmissionHookContext<TInput = unknown, TFacts = unknown>
	extends FormBuilderHookContext<TInput, TFacts> {
	/** Form slug being submitted */
	readonly formSlug: string;
	/** Form ID */
	readonly formId: string;
}

type FormReadFacts = PermissionFactsFor<
	typeof formBuilderPermissions.form.read
>;
type FormRenderFacts = PermissionFactsFor<
	typeof formBuilderPermissions.form.render
>;
type FormCreateFacts = PermissionFactsFor<
	typeof formBuilderPermissions.form.create
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

/** Authorized form-list lifecycle context. */
export type FormListOperationContext = FormBuilderHookContext<
	ListFormsQuery,
	FormReadFacts
>;
/** Authorized form-detail lifecycle context. */
export type FormGetOperationContext =
	| FormBuilderHookContext<{ id: string }, FormReadFacts>
	| FormBuilderHookContext<{ slug: string }, FormRenderFacts>;
/** Authorized editor-data lifecycle context. */
export type FormGetForUpdateOperationContext = FormBuilderHookContext<
	{ id: string },
	FormUpdateFacts
>;
/** Authorized form-create lifecycle context. */
export type FormCreateOperationContext = FormBuilderHookContext<
	CreateFormInput,
	FormCreateFacts
>;
/** Authorized form-update lifecycle context. */
export type FormUpdateOperationContext = FormBuilderHookContext<
	{ id: string; data: UpdateFormInput },
	FormUpdateFacts
>;
/** Authorized form-delete lifecycle context. */
export type FormDeleteOperationContext = FormBuilderHookContext<
	{ id: string },
	FormDeleteFacts
>;
/** Authorized public submission lifecycle context. */
export type SubmissionCreateOperationContext = SubmissionHookContext<
	{ slug: string } & SubmitFormInput,
	SubmissionCreateFacts
>;
/** Authorized submission-list lifecycle context. */
export type SubmissionListOperationContext = FormBuilderHookContext<
	{ formId: string; query: ListSubmissionsQuery },
	SubmissionReadFacts
>;
/** Authorized submission-detail lifecycle context. */
export type SubmissionGetOperationContext = FormBuilderHookContext<
	{ formId: string; submissionId: string },
	SubmissionReadFacts
>;
/** Authorized submission-delete lifecycle context. */
export type SubmissionDeleteOperationContext = FormBuilderHookContext<
	{ formId: string; submissionId: string },
	SubmissionDeleteFacts
>;

/** Typed context union used by the cross-operation error hook. */
export type FormBuilderOperationHookContext =
	| FormListOperationContext
	| FormGetOperationContext
	| FormGetForUpdateOperationContext
	| FormCreateOperationContext
	| FormUpdateOperationContext
	| FormDeleteOperationContext
	| SubmissionCreateOperationContext
	| SubmissionListOperationContext
	| SubmissionGetOperationContext
	| SubmissionDeleteOperationContext;

/**
 * Input data for creating a form
 */
export interface FormInput {
	name: string;
	slug: string;
	description?: string;
	schema: string;
	successMessage?: string;
	redirectUrl?: string;
	status?: "active" | "inactive" | "archived";
	createdBy?: string;
}

/**
 * Input data for updating a form
 */
export interface FormUpdate {
	name?: string;
	slug?: string;
	description?: string;
	schema?: string;
	successMessage?: string;
	redirectUrl?: string;
	status?: "active" | "inactive" | "archived";
}

/**
 * Backend hooks for Form Builder plugin
 *
 * Authorization runs before these hooks. Hooks receive trusted typed operation
 * context and can enforce domain invariants or perform lifecycle behavior.
 */
export interface FormBuilderBackendHooks {
	// ============================================================================
	// FORM CRUD HOOKS (Admin operations)
	// ============================================================================

	/** Called before listing forms to enforce domain preconditions. */
	onBeforeListForms?: (ctx: FormListOperationContext) => Promise<void> | void;

	/** Called before creating a form. Throw an error to deny, or return modified data. */
	onBeforeCreateForm?: (
		data: FormInput,
		ctx: FormCreateOperationContext,
	) => Promise<FormInput | void> | FormInput | void;

	/** Called after a form is created */
	onAfterCreateForm?: (
		form: SerializedForm,
		ctx: FormCreateOperationContext,
	) => Promise<void> | void;

	/** Called before getting a form by ID or slug. */
	onBeforeGetForm?: (
		idOrSlug: string,
		ctx: FormGetOperationContext,
	) => Promise<void> | void;

	/** Called before loading editor data through the form update permission. */
	onBeforeGetFormForUpdate?: (
		id: string,
		ctx: FormGetForUpdateOperationContext,
	) => Promise<void> | void;

	/** Called before updating a form. Throw an error to deny, or return modified data. */
	onBeforeUpdateForm?: (
		id: string,
		data: FormUpdate,
		ctx: FormUpdateOperationContext,
	) => Promise<FormUpdate | void> | FormUpdate | void;

	/** Called after a form is updated */
	onAfterUpdateForm?: (
		form: SerializedForm,
		ctx: FormUpdateOperationContext,
	) => Promise<void> | void;

	/** Called before deleting a form. Throw an error to deny. */
	onBeforeDeleteForm?: (
		id: string,
		ctx: FormDeleteOperationContext,
	) => Promise<void> | void;

	/** Called after a form is deleted */
	onAfterDeleteForm?: (
		id: string,
		ctx: FormDeleteOperationContext,
	) => Promise<void> | void;

	// ============================================================================
	// SUBMISSION HOOKS (Public form submissions)
	// ============================================================================

	/**
	 * Called before processing a form submission.
	 * Use for: spam protection, rate limiting, data validation/enrichment.
	 *
	 * Throw an error to reject submission (400), or return modified data to continue.
	 */
	onBeforeSubmission?: (
		formSlug: string,
		data: Record<string, unknown>,
		ctx: SubmissionCreateOperationContext,
	) => Promise<Record<string, unknown> | void> | Record<string, unknown> | void;

	/**
	 * Called after a submission is saved.
	 * Use for: sending emails, storing in CRM, triggering workflows.
	 */
	onAfterSubmission?: (
		submission: SerializedFormSubmission,
		form: SerializedForm,
		ctx: SubmissionCreateOperationContext,
	) => Promise<void> | void;

	/** Called when a submission fails */
	onErrorSubmission?: (
		error: Error,
		formSlug: string,
		data: Record<string, unknown>,
		ctx: SubmissionCreateOperationContext,
	) => Promise<void> | void;

	// ============================================================================
	// SUBMISSIONS MANAGEMENT HOOKS (Admin viewing submissions)
	// ============================================================================

	/** Called before listing submissions to enforce domain preconditions. */
	onBeforeListSubmissions?: (
		formId: string,
		ctx: SubmissionListOperationContext,
	) => Promise<void> | void;

	/** Called before getting a submission. Throw an error to deny access. */
	onBeforeGetSubmission?: (
		submissionId: string,
		ctx: SubmissionGetOperationContext,
	) => Promise<void> | void;

	/** Called before deleting a submission. Throw an error to deny. */
	onBeforeDeleteSubmission?: (
		submissionId: string,
		ctx: SubmissionDeleteOperationContext,
	) => Promise<void> | void;

	/** Called after a submission is deleted */
	onAfterDeleteSubmission?: (
		submissionId: string,
		ctx: SubmissionDeleteOperationContext,
	) => Promise<void> | void;

	// ============================================================================
	// ERROR HOOK
	// ============================================================================

	/** Called on any error */
	onError?: (
		error: Error,
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
		ctx: FormBuilderOperationHookContext,
	) => Promise<void> | void;
}

/**
 * Configuration for the Form Builder backend plugin
 */
export interface FormBuilderBackendConfig {
	/** Optional hooks for customizing behavior */
	hooks?: FormBuilderBackendHooks;
}
