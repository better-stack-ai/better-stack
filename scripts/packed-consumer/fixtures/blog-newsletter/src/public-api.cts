import blog = require("@btst/plugin-blog/client");
import newsletter = require("@btst/plugin-newsletter/client");
import integration = require("@btst/plugin-newsletter/client/blog-integration");
const blogOverrides: blog.BlogPluginOverrides = {
	uploadImage: async () => "https://example.test/image.png",
	editPostAction: integration.NewsletterAction,
};
const newsletterOverrides: newsletter.NewsletterPluginOverrides = {
	CampaignSource: integration.BlogCampaignSource,
};
export { blogOverrides, newsletterOverrides };
