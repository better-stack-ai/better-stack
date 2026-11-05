import { COMMENTS_THREAD } from "./comments-thread";
import { COMMENTS_MODERATION } from "./comments-moderation";
import { COMMENTS_MY } from "./comments-my";

export const COMMENTS_LOCALIZATION = {
	...COMMENTS_THREAD,
	...COMMENTS_MODERATION,
	...COMMENTS_MY,
};

export type CommentsLocalization = typeof COMMENTS_LOCALIZATION;
