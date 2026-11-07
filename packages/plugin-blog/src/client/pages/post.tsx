"use client";

import { createPostPage } from "../components/pages/post-page";
import { PostPage as Content } from "../components/pages/post-page.internal";

/** Prefetched guarded page; the native framework owns loading and Suspense. */
export const PostPage = createPostPage(Content, { suspense: false });
