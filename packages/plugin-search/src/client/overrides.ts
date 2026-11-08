import type { ReactNode } from "react";
import type { SearchResult } from "../types";

/** Presentation choices for the shared Search UI. */
export interface SearchPluginOverrides {
	/** Label above the results route. */
	title?: string;
	/** Search field prompt. */
	placeholder?: string;
	/** Message shown when a completed query has no matches. */
	emptyMessage?: string;
	/** Presentational row content; Search retains links/options and selection behavior. */
	renderResult?: (item: SearchResult) => ReactNode;
	/** Visual loading content; Search retains the accessible announcement. */
	renderLoading?: () => ReactNode;
}
