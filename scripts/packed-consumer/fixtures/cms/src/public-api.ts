import { cmsBackendPlugin, type CMSBackendConfig } from "@btst/plugin-cms/api";
import {
	cmsClientPlugin,
	type CMSPluginOverrides,
} from "@btst/plugin-cms/client";
import { DashboardPage } from "@btst/plugin-cms/client/components";
import { useContentTypes } from "@btst/plugin-cms/client/hooks";
import {
	createCMSQueryKeys,
	contentListDiscriminator,
} from "@btst/plugin-cms/query-keys";
import { cmsPermissions } from "@btst/plugin-cms/permissions";
import type {
	ContentItem,
	ContentType,
	SerializedContentItemWithType,
} from "@btst/plugin-cms/types";

export type PackedCMSApi = {
	backend: typeof cmsBackendPlugin;
	backendConfig: CMSBackendConfig;
	client: typeof cmsClientPlugin;
	overrides: CMSPluginOverrides;
	dashboard: typeof DashboardPage;
	hook: typeof useContentTypes;
	queryKeys: typeof createCMSQueryKeys;
	discriminator: typeof contentListDiscriminator;
	permissions: typeof cmsPermissions;
	item: ContentItem;
	type: ContentType;
	serialized: SerializedContentItemWithType;
};
