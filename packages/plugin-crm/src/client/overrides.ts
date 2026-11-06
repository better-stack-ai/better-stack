import type { ComponentType } from "react";
import type { Activity } from "../types";

/** CRM labels supplied by the host application. */
export interface CrmPluginOverrides {
	/** Activity metadata and body; activity actions and authorization remain built-in. */
	pageOverrides?: Partial<
		Record<
			"contactDetail" | "dealDetail",
			{
				ActivitySummary?: ComponentType<{ activity: Activity }>;
			}
		>
	>;
	/** Navigation labels; remaining labels use the built-in English copy. */
	localization?: { contacts?: string; companies?: string; pipelines?: string };
}
