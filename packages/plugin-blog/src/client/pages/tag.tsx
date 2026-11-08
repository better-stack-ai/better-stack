"use client";

import { createTagPage } from "../components/pages/tag-page";
import { TagPage as Content } from "../components/pages/tag-page.internal";

/** Prefetched guarded page; the native framework owns loading and Suspense. */
export const TagPage = createTagPage(Content, { suspense: false });
