"use client";

import { DashboardPageComponent as DashboardPageImpl } from "./pages/dashboard-page";
import { ContentListPageComponent as ContentListPageImpl } from "./pages/content-list-page";
import { ContentEditorPageComponent as ContentEditorPageImpl } from "./pages/content-editor-page";

// Re-export to ensure the client boundary is preserved
export const DashboardPage = DashboardPageImpl;
export const ContentListPage = ContentListPageImpl;
export const ContentEditorPage = ContentEditorPageImpl;
