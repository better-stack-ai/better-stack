import type { BlogPluginOverrides } from "@btst/plugin-blog/client";
import type {
	NewsletterPluginOverrides,
	CampaignSourceProps,
} from "@btst/plugin-newsletter/client";
import {
	BlogCampaignSource,
	NewsletterAction,
} from "@btst/plugin-newsletter/client/blog-integration";
const blog: BlogPluginOverrides = {
	uploadImage: async () => "https://example.test/image.png",
	editPostAction: NewsletterAction,
};
const newsletter: NewsletterPluginOverrides = {
	CampaignSource: BlogCampaignSource,
};
export { blog, newsletter };
export type Source = CampaignSourceProps;
// @ts-expect-error Source IDs are required to validate the Blog slug.
const invalid: CampaignSourceProps = { slug: "post", onLoad: () => {} };
