import { QueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { createClientStack } from "../../../client";
import { StackProvider } from "../../../context";
import {
	cmsClientPlugin,
	type CMSClientConfig,
	type CMSPluginOverrides,
} from "../client";
import {
	defaultComponentRegistry,
	uiBuilderClientPlugin,
	type UIBuilderClientConfig,
	type UIBuilderPluginOverrides,
} from "../../ui-builder/client";
import type { ContentTypeConfig } from "../types";

const queryClient = new QueryClient();
const contentTypes = [
	{
		name: "Article",
		slug: "article",
		schema: z.object({ title: z.string() }),
	},
] satisfies readonly ContentTypeConfig[];
const cmsDefinition = cmsClientPlugin({
	contentTypes,
	hooks: { onErrorLoad: () => undefined },
});
const uiBuilderDefinition = uiBuilderClientPlugin({
	components: defaultComponentRegistry,
	hooks: { onErrorLoad: () => undefined },
});

cmsDefinition.id satisfies "cms";
uiBuilderDefinition.id satisfies "uiBuilder";

const stack = createClientStack({
	api: { baseURL: "https://app.example.com", basePath: "/api/data" },
	site: { baseURL: "https://app.example.com", basePath: "/pages" },
	queryClient,
	plugins: {
		cms: cmsDefinition,
		uiBuilder: uiBuilderDefinition,
	},
});

stack.provider.plugins.cms.config?.contentTypes satisfies
	| readonly ContentTypeConfig[]
	| undefined;
stack.provider.plugins.uiBuilder.config?.components satisfies
	| typeof defaultComponentRegistry
	| undefined;

<StackProvider stack={stack} />;
<StackProvider
	stack={stack}
	overrides={{
		cms: {
			uploadImage: async () => "https://cdn.example.com/image.png",
		},
	}}
/>;

// @ts-expect-error CMS override values are inferred from registration.
StackProvider({ stack, overrides: { cms: { uploadImage: "not-a-function" } } });
StackProvider({
	stack,
	overrides: {
		uiBuilder: {
			// @ts-expect-error UI Builder components are configured by uiBuilderClientPlugin().
			componentRegistry: defaultComponentRegistry,
		},
	},
});
// @ts-expect-error Kebab-case is only a package and route slug.
StackProvider({ stack, overrides: { "ui-builder": {} } });

createClientStack({
	api: { baseURL: "https://app.example.com", basePath: "/api/data" },
	site: { baseURL: "https://app.example.com", basePath: "/pages" },
	queryClient,
	plugins: {
		// @ts-expect-error The registration key must match the literal CMS ID.
		content: cmsClientPlugin(),
	},
});

createClientStack({
	api: { baseURL: "https://app.example.com", basePath: "/api/data" },
	site: { baseURL: "https://app.example.com", basePath: "/pages" },
	queryClient,
	plugins: {
		// @ts-expect-error The programmatic ID is camelCase.
		"ui-builder": uiBuilderClientPlugin(),
	},
});

const cmsOptions: CMSClientConfig = { contentTypes };
const uiBuilderOptions: UIBuilderClientConfig = {
	components: defaultComponentRegistry,
};
void cmsOptions;
void uiBuilderOptions;

cmsClientPlugin({
	// @ts-expect-error Shared API origins belong to createClientStack().
	apiBaseURL: "https://api.example.com",
});
cmsClientPlugin({
	// @ts-expect-error Shared API paths belong to createClientStack().
	apiBasePath: "/api/cms",
});
cmsClientPlugin({
	// @ts-expect-error Shared site origins belong to createClientStack().
	siteBaseURL: "https://www.example.com",
});
cmsClientPlugin({
	// @ts-expect-error Shared site paths belong to createClientStack().
	siteBasePath: "/content",
});
cmsClientPlugin({
	// @ts-expect-error The query client belongs to createClientStack().
	queryClient,
});
cmsClientPlugin({
	// @ts-expect-error Request headers belong to createClientStack().api.
	headers: new Headers(),
});
cmsClientPlugin({
	hooks: {
		// @ts-expect-error The canonical loader error callback is onErrorLoad.
		onLoadError: () => undefined,
	},
});

uiBuilderClientPlugin({
	// @ts-expect-error Shared API origins belong to createClientStack().
	apiBaseURL: "https://api.example.com",
});
uiBuilderClientPlugin({
	// @ts-expect-error Shared API paths belong to createClientStack().
	apiBasePath: "/api/cms",
});
uiBuilderClientPlugin({
	// @ts-expect-error Shared site origins belong to createClientStack().
	siteBaseURL: "https://www.example.com",
});
uiBuilderClientPlugin({
	// @ts-expect-error Shared site paths belong to createClientStack().
	siteBasePath: "/builder",
});
uiBuilderClientPlugin({
	// @ts-expect-error The query client belongs to createClientStack().
	queryClient,
});
uiBuilderClientPlugin({
	// @ts-expect-error Request headers belong to createClientStack().api.
	headers: new Headers(),
});
uiBuilderClientPlugin({
	// @ts-expect-error The canonical factory field is components.
	componentRegistry: defaultComponentRegistry,
});
uiBuilderClientPlugin({
	hooks: {
		// @ts-expect-error The canonical loader error callback is onErrorLoad.
		onLoadError: () => undefined,
	},
});

const cmsOverrides: CMSPluginOverrides = {
	uploadImage: async () => "https://cdn.example.com/image.png",
	// @ts-expect-error Transport headers are endpoint configuration, not CMS overrides.
	headers: { authorization: "secret" },
};
void cmsOverrides;

const uiBuilderOverrides: UIBuilderPluginOverrides = {
	// @ts-expect-error Transport headers are endpoint configuration, not UI Builder overrides.
	headers: { authorization: "secret" },
};
void uiBuilderOverrides;

const uiBuilderSiteOverrides: UIBuilderPluginOverrides = {
	// @ts-expect-error Site paths belong to createClientStack(), not UI Builder overrides.
	siteBasePath: "/builder",
};
void uiBuilderSiteOverrides;

const uiBuilderHookOverrides: UIBuilderPluginOverrides = {
	// @ts-expect-error Loader hooks belong to uiBuilderClientPlugin().
	hooks: { onErrorLoad: () => undefined },
};
void uiBuilderHookOverrides;

createClientStack({
	api: { baseURL: "https://app.example.com", basePath: "/api/data" },
	site: { baseURL: "https://app.example.com", basePath: "/pages" },
	queryClient,
	plugins: { cms: cmsDefinition, uiBuilder: uiBuilderDefinition },
	endpoints: {
		uiBuilder: {
			// @ts-expect-error UI Builder inherits the CMS data endpoint.
			api: { basePath: "/api/second-cms" },
		},
	},
});
