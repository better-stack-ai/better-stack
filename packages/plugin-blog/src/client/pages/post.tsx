"use client";

import { createPostPage } from "../components/pages/post-page";
import { PostPage as Content } from "../components/pages/post-page.internal";

/** Complete guarded page for a native framework route; contains no lazy page import. */
export const PostPage = createPostPage(Content);
