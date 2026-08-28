import { QueryClient } from "@tanstack/react-query";
import { createClientStack } from "../../../client";
import { StackProvider } from "../../../context";
import {
	commentsClientPlugin,
	type CommentsClientConfig,
	type CommentsPluginOverrides,
} from "../client";

const queryClient = new QueryClient();
const definition = commentsClientPlugin({
	hooks: { onErrorLoad: () => undefined },
});

definition.id satisfies "comments";

const stack = createClientStack({
	api: { baseURL: "https://app.example.com", basePath: "/api/data" },
	site: { baseURL: "https://app.example.com", basePath: "/pages" },
	queryClient,
	plugins: { comments: definition },
});

<StackProvider stack={stack} />;
<StackProvider
	stack={stack}
	overrides={{ comments: { allowPosting: false, defaultCommentSort: "asc" } }}
/>;

// @ts-expect-error Comments override values are inferred from registration.
StackProvider({ stack, overrides: { comments: { allowPosting: "yes" } } });

// @ts-expect-error Unregistered provider override keys are rejected.
StackProvider({ stack, overrides: { blog: {} } });

createClientStack({
	api: { baseURL: "https://app.example.com", basePath: "/api/data" },
	site: { baseURL: "https://app.example.com", basePath: "/pages" },
	queryClient,
	plugins: {
		// @ts-expect-error The registration key must match the literal Comments ID.
		discussion: commentsClientPlugin(),
	},
});

const pluginOptions: CommentsClientConfig = {};
void pluginOptions;

commentsClientPlugin({
	// @ts-expect-error Shared API origins belong to createClientStack().
	apiBaseURL: "https://api.example.com",
});
commentsClientPlugin({
	// @ts-expect-error Shared API paths belong to createClientStack().
	apiBasePath: "/api/comments",
});
commentsClientPlugin({
	// @ts-expect-error Shared site origins belong to createClientStack().
	siteBaseURL: "https://www.example.com",
});
commentsClientPlugin({
	// @ts-expect-error Shared site paths belong to createClientStack().
	siteBasePath: "/discussion",
});
commentsClientPlugin({
	// @ts-expect-error The query client belongs to createClientStack().
	queryClient,
});
commentsClientPlugin({
	// @ts-expect-error Request headers belong to createClientStack().api.
	headers: new Headers(),
});
commentsClientPlugin({
	hooks: {
		// @ts-expect-error The canonical loader error callback is onErrorLoad.
		onLoadError: () => undefined,
	},
});

const browserOverrides: CommentsPluginOverrides = {
	allowEditing: false,
	// @ts-expect-error Transport headers are endpoint configuration, not Comments overrides.
	headers: { authorization: "secret" },
};
void browserOverrides;
