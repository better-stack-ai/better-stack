/**
 * Removed CMS lifecycle names and their canonical v3 replacements.
 *
 * The aggregate error callback remains one phase. Its operation argument
 * distinguishes create, update, delete, list, and get failures.
 */
export const CMS_LIFECYCLE_HOOK_MIGRATIONS = Object.freeze({
	onBeforeCreate: "onBeforeCreateContent",
	onAfterCreate: "onAfterCreateContent",
	onBeforeUpdate: "onBeforeUpdateContent",
	onAfterUpdate: "onAfterUpdateContent",
	onBeforeDelete: "onBeforeDeleteContent",
	onAfterDelete: "onAfterDeleteContent",
	onError: "onErrorExecuteContentOperation",
} as const);
