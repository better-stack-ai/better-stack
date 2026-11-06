import { lazy, type ComponentType } from "react";
import {
	defineClientPlugin,
	defineRoute,
	defineRoutes,
} from "@btst/stack/plugins/client";
import { FEATURE_FLAGS_PLUGIN_ID } from "./constants";
import type { FeatureFlagsPluginOverrides } from "./overrides";

const Flags = lazy(() =>
	import("./components/pages").then((module) => ({
		default: module.FlagsPageComponent,
	})),
);
const Editor = lazy(() =>
	import("./components/pages").then((module) => ({
		default: module.EditFlagPageComponent,
	})),
);
const Log = lazy(() =>
	import("./components/pages").then((module) => ({
		default: module.FlagDetailPageComponent,
	})),
);

/** Optional replacements for the built-in feature flag management pages. */
export interface FeatureFlagsClientConfig {
	/** Ejected or custom pages using the same routes. */
	pageComponents?: {
		flags?: ComponentType;
		newFlag?: ComponentType;
		editFlag?: ComponentType<{ params: { key: string } }>;
		flagDetail?: ComponentType<{ params: { key: string } }>;
	};
}

/** Runtime feature evaluation and dynamic administration routes. */
export const featureFlagsClientPlugin = (
	config: FeatureFlagsClientConfig = {},
) =>
	defineClientPlugin<FeatureFlagsPluginOverrides>()({
		id: FEATURE_FLAGS_PLUGIN_ID,
		resolve: () => ({
			routes: () =>
				defineRoutes(
					{
						flags: defineRoute("/feature-flags", {
							page: Flags,
							meta: () => meta("Feature flags"),
						}),
						newFlag: defineRoute("/feature-flags/new", {
							page: () => <Editor />,
							meta: () => meta("New flag"),
						}),
						editFlag: defineRoute("/feature-flags/:key", {
							page: ({ params }) => <Editor flagKey={params.key} />,
							meta: () => meta("Edit flag"),
						}),
						flagDetail: defineRoute("/feature-flags/:key/log", {
							page: ({ params }) => <Log flagKey={params.key} />,
							meta: () => meta("Flag evaluations"),
						}),
					},
					{ pages: config.pageComponents },
				),
			sitemap: async () => [],
		}),
	});

function meta(title: string) {
	return [{ title }, { name: "robots", content: "noindex, nofollow" }];
}
