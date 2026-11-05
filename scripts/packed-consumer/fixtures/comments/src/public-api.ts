import {
	commentsBackendPlugin,
	COMMENTS_QUERY_KEYS,
	type CommentsBackendOptions,
} from "@btst/plugin-comments/api";
import {
	commentsClientPlugin,
	type CommentsPluginOverrides,
} from "@btst/plugin-comments/client";
import {
	useComments,
	usePostComment,
} from "@btst/plugin-comments/client/hooks";
import {
	CommentThread,
	CommentForm,
	CommentCount,
	ModerationPageComponent,
} from "@btst/plugin-comments/client/components";
import { createCommentsQueryKeys } from "@btst/plugin-comments/query-keys";
import { commentsPermissions } from "@btst/plugin-comments/permissions";
import type { SerializedComment } from "@btst/plugin-comments/types";
export {
	commentsBackendPlugin,
	COMMENTS_QUERY_KEYS,
	commentsClientPlugin,
	useComments,
	usePostComment,
	CommentThread,
	CommentForm,
	CommentCount,
	ModerationPageComponent,
	createCommentsQueryKeys,
	commentsPermissions,
};
export type {
	CommentsBackendOptions,
	CommentsPluginOverrides,
	SerializedComment,
};
