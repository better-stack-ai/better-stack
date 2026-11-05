import {
	UI_BUILDER_CONTENT_TYPE,
	UI_BUILDER_TYPE_SLUG,
	type ComponentLayer,
	type ComponentRegistry,
} from "@btst/plugin-ui-builder";
import {
	uiBuilderClientPlugin,
	createComponentRegistry,
	type UIBuilderPluginOverrides,
} from "@btst/plugin-ui-builder/client";
import {
	PageRenderer,
	PageBuilderPage,
} from "@btst/plugin-ui-builder/client/components";
import { useUIBuilderPages } from "@btst/plugin-ui-builder/client/hooks";
import { createUIBuilderQueryKeys } from "@btst/plugin-ui-builder/query-keys";
import type { SerializedUIBuilderPage } from "@btst/plugin-ui-builder/types";

export type PackedUIBuilder = {
	contentType: typeof UI_BUILDER_CONTENT_TYPE;
	typeSlug: typeof UI_BUILDER_TYPE_SLUG;
	client: typeof uiBuilderClientPlugin;
	registry: typeof createComponentRegistry;
	overrides: UIBuilderPluginOverrides;
	renderer: typeof PageRenderer;
	editor: typeof PageBuilderPage;
	hook: typeof useUIBuilderPages;
	queryKeys: typeof createUIBuilderQueryKeys;
	layer: ComponentLayer;
	components: ComponentRegistry;
	page: SerializedUIBuilderPage;
};
