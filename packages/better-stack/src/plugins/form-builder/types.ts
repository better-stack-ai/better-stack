/**
 * Form Builder Plugin Types
 *
 * Key distinction from CMS Plugin:
 * - CMS uses developer-defined Zod schemas in code
 * - Form Builder allows non-technical admins to build forms via drag-and-drop UI
 * - Forms are serialized to/from JSON Schema for storage
 */

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
	status: string;
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

/**
 * Serialized form submission with parsed data
 */
export interface SerializedFormSubmissionWithData<
	TData = Record<string, unknown>,
> extends SerializedFormSubmission {
	/** Parsed data object (JSON.parse of data field) */
	parsedData: TData;
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

/**
 * Paginated list response for form submissions
 */
export interface PaginatedFormSubmissions<TData = Record<string, unknown>> {
	items: SerializedFormSubmissionWithData<TData>[];
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
export interface FormBuilderHookContext {
	/** User ID if authenticated */
	userId?: string;
	/** Request headers */
	headers?: Headers;
	/** Client IP address (for rate limiting) */
	ipAddress?: string;
	/** User agent string */
	userAgent?: string;
}

/**
 * Context for submission-specific hooks
 */
export interface SubmissionHookContext extends FormBuilderHookContext {
	/** Form slug being submitted */
	formSlug: string;
	/** Form ID */
	formId: string;
}

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
 * All CRUD hooks receive ipAddress and headers for auth/rate limiting.
 * Return false from onBefore* hooks to reject the operation (throws 403).
 */
export interface FormBuilderBackendHooks {
	// ============================================================================
	// FORM CRUD HOOKS (Admin operations)
	// ============================================================================

	/** Called before listing forms. Return false to deny access (403). */
	onBeforeListForms?: (
		ctx: FormBuilderHookContext,
	) => Promise<boolean> | boolean;

	/** Called before creating a form. Return false to deny, or modified data. */
	onBeforeFormCreated?: (
		data: FormInput,
		ctx: FormBuilderHookContext,
	) => Promise<FormInput | false> | FormInput | false;

	/** Called after a form is created */
	onAfterFormCreated?: (
		form: SerializedForm,
		ctx: FormBuilderHookContext,
	) => Promise<void> | void;

	/** Called before getting a form by ID or slug. Return false to deny access. */
	onBeforeGetForm?: (
		idOrSlug: string,
		ctx: FormBuilderHookContext,
	) => Promise<boolean> | boolean;

	/** Called before updating a form. Return false to deny, or modified data. */
	onBeforeFormUpdated?: (
		id: string,
		data: FormUpdate,
		ctx: FormBuilderHookContext,
	) => Promise<FormUpdate | false> | FormUpdate | false;

	/** Called after a form is updated */
	onAfterFormUpdated?: (
		form: SerializedForm,
		ctx: FormBuilderHookContext,
	) => Promise<void> | void;

	/** Called before deleting a form. Return false to deny. */
	onBeforeFormDeleted?: (
		id: string,
		ctx: FormBuilderHookContext,
	) => Promise<boolean> | boolean;

	/** Called after a form is deleted */
	onAfterFormDeleted?: (
		id: string,
		ctx: FormBuilderHookContext,
	) => Promise<void> | void;

	// ============================================================================
	// SUBMISSION HOOKS (Public form submissions)
	// ============================================================================

	/**
	 * Called before processing a form submission.
	 * Use for: spam protection, rate limiting, data validation/enrichment.
	 *
	 * @returns false to reject submission (400), or modified data to continue
	 */
	onBeforeSubmission?: (
		formSlug: string,
		data: Record<string, unknown>,
		ctx: SubmissionHookContext,
	) =>
		| Promise<Record<string, unknown> | false>
		| Record<string, unknown>
		| false;

	/**
	 * Called after a submission is saved.
	 * Use for: sending emails, storing in CRM, triggering workflows.
	 */
	onAfterSubmission?: (
		submission: SerializedFormSubmission,
		form: SerializedForm,
		ctx: SubmissionHookContext,
	) => Promise<void> | void;

	/** Called when a submission fails */
	onSubmissionError?: (
		error: Error,
		formSlug: string,
		data: Record<string, unknown>,
		ctx: SubmissionHookContext,
	) => Promise<void> | void;

	// ============================================================================
	// SUBMISSIONS MANAGEMENT HOOKS (Admin viewing submissions)
	// ============================================================================

	/** Called before listing submissions. Return false to deny access (403). */
	onBeforeListSubmissions?: (
		formId: string,
		ctx: FormBuilderHookContext,
	) => Promise<boolean> | boolean;

	/** Called before getting a submission. Return false to deny access. */
	onBeforeGetSubmission?: (
		submissionId: string,
		ctx: FormBuilderHookContext,
	) => Promise<boolean> | boolean;

	/** Called before deleting a submission. Return false to deny. */
	onBeforeSubmissionDeleted?: (
		submissionId: string,
		ctx: FormBuilderHookContext,
	) => Promise<boolean> | boolean;

	/** Called after a submission is deleted */
	onAfterSubmissionDeleted?: (
		submissionId: string,
		ctx: FormBuilderHookContext,
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
		ctx: FormBuilderHookContext,
	) => Promise<void> | void;
}

/**
 * Configuration for the Form Builder backend plugin
 */
export interface FormBuilderBackendConfig {
	/** Optional hooks for customizing behavior */
	hooks?: FormBuilderBackendHooks;
}
