/** Presentation choices for the shared Search UI. */
export interface SearchPluginOverrides {
	/** Label above the results route. */
	title?: string;
	/** Search field prompt. */
	placeholder?: string;
	/** Message shown when a completed query has no matches. */
	emptyMessage?: string;
}
