/**
 * Removed Blog lifecycle names and their canonical v3 replacements.
 *
 * This structured inventory is the source for migration documentation and
 * repository guards. Names absent from this map did not change.
 */
export const BLOG_LIFECYCLE_HOOK_MIGRATIONS = Object.freeze({
	onBeforeNextPreviousPosts: "onBeforeGetNextPreviousPosts",
	onPostsRead: "onAfterListPosts",
	onPostCreated: "onAfterCreatePost",
	onPostUpdated: "onAfterUpdatePost",
	onPostDeleted: "onAfterDeletePost",
	onNextPreviousPostsRead: "onAfterGetNextPreviousPosts",
	onListPostsError: "onErrorListPosts",
	onNextPreviousPostsError: "onErrorGetNextPreviousPosts",
	onCreatePostError: "onErrorCreatePost",
	onUpdatePostError: "onErrorUpdatePost",
	onDeletePostError: "onErrorDeletePost",
} as const);
