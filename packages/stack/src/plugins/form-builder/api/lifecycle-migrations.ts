/**
 * Removed Form Builder lifecycle names and their canonical v3 replacements.
 *
 * Submission receipt keeps its domain vocabulary. Names absent from this map
 * did not change.
 */
export const FORM_BUILDER_LIFECYCLE_HOOK_MIGRATIONS = Object.freeze({
	onBeforeFormCreated: "onBeforeCreateForm",
	onAfterFormCreated: "onAfterCreateForm",
	onBeforeFormUpdated: "onBeforeUpdateForm",
	onAfterFormUpdated: "onAfterUpdateForm",
	onBeforeFormDeleted: "onBeforeDeleteForm",
	onAfterFormDeleted: "onAfterDeleteForm",
	onSubmissionError: "onErrorSubmission",
	onBeforeSubmissionDeleted: "onBeforeDeleteSubmission",
	onAfterSubmissionDeleted: "onAfterDeleteSubmission",
} as const);
