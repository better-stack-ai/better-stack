"use client";

import { createHomePage } from "../components/pages/home-page";
import { HomePage as Content } from "../components/pages/home-page.internal";

/** Complete guarded page for a native framework route; contains no lazy page import. */
export const PostListPage = createHomePage(Content);
