import { BLOG_CARD } from "./blog-card";
import { BLOG_COMMON } from "./blog-common";
import { BLOG_LIST } from "./blog-list";
import { BLOG_POST } from "./blog-post";
import { BLOG_FORMS } from "./blog-forms";

export const BLOG_LOCALIZATION = {
	...BLOG_COMMON,
	...BLOG_LIST,
	...BLOG_CARD,
	...BLOG_POST,
	...BLOG_FORMS,
};

export type BlogLocalization = typeof BLOG_LOCALIZATION;
