import type { ComponentType } from "react";

/** Loads optional source content into a new campaign. */
export interface CampaignSourceProps {
	slug: string;
	postId: string;
	onLoad: (subject: string, body: string) => void;
}

/** Newsletter-specific presentation options; shared services come from StackProvider. */
export interface NewsletterPluginOverrides {
	/** Optional source loader for campaigns created from another feature. */
	CampaignSource?: ComponentType<CampaignSourceProps>;
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
