import type { ComponentType } from "react";

/** Presentation choices for the feature flag management pages. */
export interface FeatureFlagsPluginOverrides {
	/** Override the rollout display on a specific built-in page. */
	pageOverrides?: Partial<
		Record<
			"flags" | "newFlag" | "editFlag",
			{ Rollout?: ComponentType<{ percent: number }> }
		>
	>;
	/** Override the management page title and create action. */
	localization?: Partial<{ title: string; newFlag: string }>;
}
