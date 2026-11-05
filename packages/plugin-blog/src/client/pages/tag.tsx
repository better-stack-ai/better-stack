"use client";

import { createTagPage } from "../components/pages/tag-page";
import { TagPage as Content } from "../components/pages/tag-page.internal";

/** Complete guarded page for a native framework route; contains no lazy page import. */
export const TagPage = createTagPage(Content);
