/** Presentation choices for the feature flag management pages. */
export interface FeatureFlagsPluginOverrides {
	/** Override the management page title and create action. */
	localization?: Partial<{ title: string; newFlag: string }>;
}
