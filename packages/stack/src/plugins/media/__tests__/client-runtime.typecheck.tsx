import { QueryClient } from "@tanstack/react-query";
import { createClientStack } from "../../../client";
import { StackProvider } from "../../../context";
import {
	mediaClientPlugin,
	type MediaClientConfig,
	type MediaPluginOverrides,
} from "../client";
import {
	routeDocsClientPlugin,
	type RouteDocsClientConfig,
} from "../../route-docs/client";

const queryClient = new QueryClient();
const mediaDefinition = mediaClientPlugin({
	uploadMode: "s3",
	hooks: { onErrorLoad: () => undefined },
});
const routeDocsDefinition = routeDocsClientPlugin({ title: "Routes" });

mediaDefinition.id satisfies "media";
routeDocsDefinition.id satisfies "routeDocs";

const stack = createClientStack({
	api: { baseURL: "https://app.example.com", basePath: "/api/data" },
	site: { baseURL: "https://app.example.com", basePath: "/pages" },
	queryClient,
	plugins: { media: mediaDefinition, routeDocs: routeDocsDefinition },
});

<StackProvider stack={stack} />;
<StackProvider
	stack={stack}
	overrides={{ media: { imageCompression: false } }}
/>;

// @ts-expect-error Route Docs has no provider override activation block.
StackProvider({ stack, overrides: { routeDocs: {} } });
// @ts-expect-error Kebab-case is a package and URL slug, not a programmatic ID.
StackProvider({ stack, overrides: { "route-docs": {} } });

createClientStack({
	api: { baseURL: "https://app.example.com", basePath: "/api/data" },
	site: { baseURL: "https://app.example.com", basePath: "/pages" },
	queryClient,
	plugins: {
		// @ts-expect-error The registration key must match Media's literal ID.
		assets: mediaClientPlugin(),
	},
});

createClientStack({
	api: { baseURL: "https://app.example.com", basePath: "/api/data" },
	site: { baseURL: "https://app.example.com", basePath: "/pages" },
	queryClient,
	plugins: {
		// @ts-expect-error The registration key must match Route Docs' literal ID.
		"route-docs": routeDocsClientPlugin(),
	},
});

mediaClientPlugin({
	// @ts-expect-error Shared API origins belong to createClientStack().
	apiBaseURL: "https://app.example.com",
});
mediaClientPlugin({
	// @ts-expect-error Shared API paths belong to createClientStack().
	apiBasePath: "/api/data",
});
mediaClientPlugin({
	// @ts-expect-error Shared site origins belong to createClientStack().
	siteBaseURL: "https://app.example.com",
});
mediaClientPlugin({
	// @ts-expect-error Shared site paths belong to createClientStack().
	siteBasePath: "/pages",
});
mediaClientPlugin({
	// @ts-expect-error The query client belongs to createClientStack().
	queryClient,
});
mediaClientPlugin({
	// @ts-expect-error Request headers belong to createClientStack().api.
	headers: new Headers(),
});
mediaClientPlugin({
	// @ts-expect-error Public browser headers belong to endpoints.media.api.
	browserHeaders: { "x-public": "value" },
});
mediaClientPlugin({
	// @ts-expect-error Browser credentials belong to endpoints.media.api.
	credentials: "include",
});
mediaClientPlugin({
	hooks: {
		// @ts-expect-error The canonical loader error callback is onErrorLoad.
		onLoadError: () => undefined,
	},
});

routeDocsClientPlugin({
	// @ts-expect-error Route Docs inherits its query client from the stack.
	queryClient,
});
routeDocsClientPlugin({
	// @ts-expect-error Route Docs inherits its site path from the stack.
	siteBasePath: "/pages",
});
routeDocsClientPlugin({
	// @ts-expect-error Route Docs has no API transport configuration.
	apiBaseURL: "https://app.example.com",
});

const mediaConfig: MediaClientConfig = { uploadMode: "vercel-blob" };
const routeDocsConfig: RouteDocsClientConfig = { description: "Routes" };
const overrides: MediaPluginOverrides = { imageCompression: false };
void mediaConfig;
void routeDocsConfig;
void overrides;

const removedOverrides: MediaPluginOverrides = {
	// @ts-expect-error Query clients are resolved by the registered stack.
	queryClient,
};
void removedOverrides;
