"use client";

import { createHomePage } from "../components/pages/home-page";
import { HomePage as Content } from "../components/pages/home-page.internal";

/** Prefetched guarded page; the native framework owns loading and Suspense. */
export const PostListPage = createHomePage(Content, { suspense: false });
