import type { ComponentType } from "react";
import type { Job } from "../types";

import type { JobBoardLocalization } from "./localization";

/** Consumer presentation overrides for the public Job Board pages. */
export interface JobBoardPluginOverrides {
	/** Individual job rows, independently on the list and department routes. */
	pageOverrides?: Partial<
		Record<
			"jobBoardList" | "jobBoardDepartment",
			{
				JobRow?: ComponentType<{ job: Job }>;
			}
		>
	>;
	/** Replace individual labels and messages without changing the data layer. */
	localization?: Partial<JobBoardLocalization>;
	/** Additional classes on the public page container. */
	className?: string;
}
