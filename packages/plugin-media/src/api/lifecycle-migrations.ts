/**
 * Removed Media lifecycle names and their canonical v3 replacements.
 *
 * Upload hooks retain their domain vocabulary. Storage-adapter callbacks are
 * transport contracts and are deliberately outside this public hook mapping.
 */
export const MEDIA_LIFECYCLE_HOOK_MIGRATIONS = Object.freeze({
	onBeforeDelete: "onBeforeDeleteAsset",
	onAfterDelete: "onAfterDeleteAsset",
	onOperationError: "onError",
} as const);
