import { QueryClient } from "@tanstack/react-query";
import { createClientStack } from "../../../client";
import { StackProvider } from "../../../context";
import {
	blogClientPlugin,
	type BlogClientConfig,
	type BlogPluginOverrides,
} from "../client";

const queryClient = new QueryClient();
const definition = blogClientPlugin({
	seo: { siteName: "Example" },
	hooks: { onErrorLoad: () => undefined },
});

definition.id satisfies "blog";

const stack = createClientStack({
	api: { baseURL: "https://app.example.com", basePath: "/api/data" },
	site: { baseURL: "https://app.example.com", basePath: "/pages" },
	queryClient,
	plugins: { blog: definition },
});

<StackProvider stack={stack} />;
<StackProvider
	stack={stack}
	overrides={{
		blog: {
			uploadImage: async () => "https://cdn.example.com/image.png",
			showAttribution: false,
		},
	}}
/>;

StackProvider({
	stack,
	overrides: {
		blog: {
			// @ts-expect-error Blog override values are inferred from registration.
			uploadImage: "not-a-function",
		},
	},
});

// @ts-expect-error Unregistered provider override keys are rejected.
StackProvider({ stack, overrides: { cms: {} } });

createClientStack({
	api: { baseURL: "https://app.example.com", basePath: "/api/data" },
	site: { baseURL: "https://app.example.com", basePath: "/pages" },
	queryClient,
	plugins: {
		// @ts-expect-error The registration key must match the literal Blog ID.
		articles: blogClientPlugin(),
	},
});

const pluginOptions: BlogClientConfig = {};
void pluginOptions;

blogClientPlugin({
	// @ts-expect-error Shared API origins belong to createClientStack().
	apiBaseURL: "https://api.example.com",
});
blogClientPlugin({
	// @ts-expect-error Shared API paths belong to createClientStack().
	apiBasePath: "/api/blog",
});
blogClientPlugin({
	// @ts-expect-error Shared site origins belong to createClientStack().
	siteBaseURL: "https://www.example.com",
});
blogClientPlugin({
	// @ts-expect-error Shared site paths belong to createClientStack().
	siteBasePath: "/articles",
});
blogClientPlugin({
	// @ts-expect-error The query client belongs to createClientStack().
	queryClient,
});
blogClientPlugin({
	// @ts-expect-error Request headers belong to createClientStack().api.
	headers: new Headers(),
});
blogClientPlugin({
	hooks: {
		// @ts-expect-error The canonical loader error callback is onErrorLoad.
		onLoadError: () => undefined,
	},
});

const browserOverrides: BlogPluginOverrides = {
	uploadImage: async () => "https://cdn.example.com/image.png",
	// @ts-expect-error Transport headers are endpoint configuration, not Blog overrides.
	headers: { authorization: "secret" },
};
void browserOverrides;
