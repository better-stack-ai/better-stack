import type { JobBoardLocalization } from "./localization";

/** Consumer presentation overrides for the public Job Board pages. */
export interface JobBoardPluginOverrides {
	/** Replace individual labels and messages without changing the data layer. */
	localization?: Partial<JobBoardLocalization>;
	/** Additional classes on the public page container. */
	className?: string;
}
