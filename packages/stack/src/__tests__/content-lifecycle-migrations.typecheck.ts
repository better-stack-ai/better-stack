import type { BlogBackendHooks } from "../plugins/blog/api";
import type { CMSBackendHooks } from "../plugins/cms/api";
import type { CommentsBackendHooks } from "../plugins/comments/api";

const canonicalBlogHooks = {
	onBeforeListPosts: async () => undefined,
	onAfterListPosts: async () => undefined,
	onErrorListPosts: async () => undefined,
	onBeforeCreatePost: async () => undefined,
	onAfterCreatePost: async () => undefined,
	onErrorCreatePost: async () => undefined,
	onBeforeUpdatePost: async () => undefined,
	onAfterUpdatePost: async () => undefined,
	onErrorUpdatePost: async () => undefined,
	onBeforeDeletePost: async () => undefined,
	onAfterDeletePost: async () => undefined,
	onErrorDeletePost: async () => undefined,
	onBeforeGetNextPreviousPosts: async () => undefined,
	onAfterGetNextPreviousPosts: async () => undefined,
	onErrorGetNextPreviousPosts: async () => undefined,
} satisfies BlogBackendHooks;

const canonicalCMSHooks = {
	onBeforeCreateContent: async () => undefined,
	onAfterCreateContent: async () => undefined,
	onBeforeUpdateContent: async () => undefined,
	onAfterUpdateContent: async () => undefined,
	onBeforeDeleteContent: async () => undefined,
	onAfterDeleteContent: async () => undefined,
	onErrorExecuteContentOperation: async () => undefined,
} satisfies CMSBackendHooks;

const canonicalCommentsHooks = {
	onBeforeListComments: async () => undefined,
	onBeforeCountComments: async () => undefined,
	onBeforeListCommentsByAuthor: async () => undefined,
	onBeforeCreateComment: async () => undefined,
	onAfterCreateComment: async () => undefined,
	onBeforeUpdateComment: async () => undefined,
	onAfterUpdateComment: async () => undefined,
	onBeforeToggleCommentReaction: async () => undefined,
	onBeforeModerateComment: async () => undefined,
	onAfterApproveComment: async () => undefined,
	onBeforeDeleteComment: async () => undefined,
	onAfterDeleteComment: async () => undefined,
} satisfies CommentsBackendHooks;

void canonicalBlogHooks;
void canonicalCMSHooks;
void canonicalCommentsHooks;

// Explicit migration fixtures: every removed spelling must stay rejected.
({
	// @ts-expect-error Use onBeforeGetNextPreviousPosts.
	onBeforeNextPreviousPosts: async () => undefined,
}) satisfies BlogBackendHooks;
// @ts-expect-error Use onAfterListPosts.
({ onPostsRead: async () => undefined }) satisfies BlogBackendHooks;
// @ts-expect-error Use onAfterCreatePost.
({ onPostCreated: async () => undefined }) satisfies BlogBackendHooks;
// @ts-expect-error Use onAfterUpdatePost.
({ onPostUpdated: async () => undefined }) satisfies BlogBackendHooks;
// @ts-expect-error Use onAfterDeletePost.
({ onPostDeleted: async () => undefined }) satisfies BlogBackendHooks;
// @ts-expect-error Use onAfterGetNextPreviousPosts.
({ onNextPreviousPostsRead: async () => undefined }) satisfies BlogBackendHooks;
// @ts-expect-error Use onErrorListPosts.
({ onListPostsError: async () => undefined }) satisfies BlogBackendHooks;
({
	// @ts-expect-error Use onErrorGetNextPreviousPosts.
	onNextPreviousPostsError: async () => undefined,
}) satisfies BlogBackendHooks;
// @ts-expect-error Use onErrorCreatePost.
({ onCreatePostError: async () => undefined }) satisfies BlogBackendHooks;
// @ts-expect-error Use onErrorUpdatePost.
({ onUpdatePostError: async () => undefined }) satisfies BlogBackendHooks;
// @ts-expect-error Use onErrorDeletePost.
({ onDeletePostError: async () => undefined }) satisfies BlogBackendHooks;

// @ts-expect-error Use onBeforeCreateContent.
({ onBeforeCreate: async () => undefined }) satisfies CMSBackendHooks;
// @ts-expect-error Use onAfterCreateContent.
({ onAfterCreate: async () => undefined }) satisfies CMSBackendHooks;
// @ts-expect-error Use onBeforeUpdateContent.
({ onBeforeUpdate: async () => undefined }) satisfies CMSBackendHooks;
// @ts-expect-error Use onAfterUpdateContent.
({ onAfterUpdate: async () => undefined }) satisfies CMSBackendHooks;
// @ts-expect-error Use onBeforeDeleteContent.
({ onBeforeDelete: async () => undefined }) satisfies CMSBackendHooks;
// @ts-expect-error Use onAfterDeleteContent.
({ onAfterDelete: async () => undefined }) satisfies CMSBackendHooks;
// @ts-expect-error Use onErrorExecuteContentOperation.
({ onError: async () => undefined }) satisfies CMSBackendHooks;

// @ts-expect-error Use onBeforeListComments.
({ onBeforeList: async () => undefined }) satisfies CommentsBackendHooks;
// @ts-expect-error Use onBeforeCountComments.
({ onBeforeCount: async () => undefined }) satisfies CommentsBackendHooks;
({
	// @ts-expect-error Use onBeforeListCommentsByAuthor.
	onBeforeListByAuthor: async () => undefined,
}) satisfies CommentsBackendHooks;
// @ts-expect-error Use onBeforeCreateComment.
({ onBeforePost: async () => undefined }) satisfies CommentsBackendHooks;
// @ts-expect-error Use onAfterCreateComment.
({ onAfterPost: async () => undefined }) satisfies CommentsBackendHooks;
// @ts-expect-error Use onBeforeUpdateComment.
({ onBeforeEdit: async () => undefined }) satisfies CommentsBackendHooks;
// @ts-expect-error Use onAfterUpdateComment.
({ onAfterEdit: async () => undefined }) satisfies CommentsBackendHooks;
// @ts-expect-error Use onBeforeToggleCommentReaction.
({ onBeforeLike: async () => undefined }) satisfies CommentsBackendHooks;
({
	// @ts-expect-error Use onBeforeModerateComment.
	onBeforeStatusChange: async () => undefined,
}) satisfies CommentsBackendHooks;
// @ts-expect-error Use onAfterApproveComment.
({ onAfterApprove: async () => undefined }) satisfies CommentsBackendHooks;
// @ts-expect-error Use onBeforeDeleteComment.
({ onBeforeDelete: async () => undefined }) satisfies CommentsBackendHooks;
// @ts-expect-error Use onAfterDeleteComment.
({ onAfterDelete: async () => undefined }) satisfies CommentsBackendHooks;
