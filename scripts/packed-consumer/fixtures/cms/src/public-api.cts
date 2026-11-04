import api = require("@btst/plugin-cms/api");
import client = require("@btst/plugin-cms/client");
import types = require("@btst/plugin-cms/types");
import queries = require("@btst/plugin-cms/query-keys");

export type CommonJSCMS = {
	backend: typeof api.cmsBackendPlugin;
	client: typeof client.cmsClientPlugin;
	record: types.SerializedContentItemWithType;
	discriminator: typeof queries.contentListDiscriminator;
};
