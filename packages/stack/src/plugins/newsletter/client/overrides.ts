/** Newsletter-specific presentation options; shared services come from StackProvider. */
export interface NewsletterPluginOverrides {
	/** Upload images inserted into a campaign's rich text editor. */
	uploadImage?: (file: File) => Promise<string>;
	/** Override navigation and page heading labels. */
	localization?: Partial<{
		title: string;
		campaigns: string;
		subscribers: string;
		newCampaign: string;
	}>;
}
