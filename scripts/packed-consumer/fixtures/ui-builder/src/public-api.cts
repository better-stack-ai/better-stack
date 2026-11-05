import ui = require("@btst/plugin-ui-builder");
import client = require("@btst/plugin-ui-builder/client");
import queries = require("@btst/plugin-ui-builder/query-keys");
import types = require("@btst/plugin-ui-builder/types");

export type CommonJSUIBuilder = {
	contentType: typeof ui.UI_BUILDER_CONTENT_TYPE;
	client: typeof client.uiBuilderClientPlugin;
	queries: typeof queries.createUIBuilderQueryKeys;
	page: types.SerializedUIBuilderPage;
};
