import api = require("@btst/plugin-newsletter/api");
import client = require("@btst/plugin-newsletter/client");
import components = require("@btst/plugin-newsletter/client/components");
import hooks = require("@btst/plugin-newsletter/client/hooks");
import keys = require("@btst/plugin-newsletter/query-keys");
import permissions = require("@btst/plugin-newsletter/permissions");
import types = require("@btst/plugin-newsletter/types");
export type CommonJSNewsletter = {
	backend: typeof api.newsletterBackendPlugin;
	client: typeof client.newsletterClientPlugin;
	editor: typeof components.EditCampaignPageComponent;
	hook: typeof hooks.useCampaign;
	key: typeof keys.createNewsletterQueryKeys;
	permission: typeof permissions.newsletterPermissions;
	record: types.CampaignRecord;
	source: client.CampaignSourceProps;
};
