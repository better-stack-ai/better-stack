/**
 * Removed Comments lifecycle names and their canonical v3 replacements.
 *
 * Approval remains a meaningful moderation event rather than being flattened
 * into a generic update callback.
 */
export const COMMENTS_LIFECYCLE_HOOK_MIGRATIONS = Object.freeze({
	onBeforeList: "onBeforeListComments",
	onBeforeCount: "onBeforeCountComments",
	onBeforeListByAuthor: "onBeforeListCommentsByAuthor",
	onBeforePost: "onBeforeCreateComment",
	onAfterPost: "onAfterCreateComment",
	onBeforeEdit: "onBeforeUpdateComment",
	onAfterEdit: "onAfterUpdateComment",
	onBeforeLike: "onBeforeToggleCommentReaction",
	onBeforeStatusChange: "onBeforeModerateComment",
	onAfterApprove: "onAfterApproveComment",
	onBeforeDelete: "onBeforeDeleteComment",
	onAfterDelete: "onAfterDeleteComment",
} as const);
