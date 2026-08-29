import { QueryClient } from "@tanstack/react-query";
import { createClientStack } from "../../../client";
import { StackProvider } from "../../../context";
import { kanbanClientPlugin, type KanbanClientConfig } from "../client";

const queryClient = new QueryClient();
const definition = kanbanClientPlugin({
	hooks: { onErrorLoad: () => undefined },
});

definition.id satisfies "kanban";

const stack = createClientStack({
	api: { baseURL: "https://app.example.com", basePath: "/api/data" },
	site: { baseURL: "https://app.example.com", basePath: "/pages" },
	queryClient,
	plugins: { kanban: definition },
});

// @ts-expect-error Kanban requires its inferred user workflow override block.
<StackProvider stack={stack} />;
<StackProvider
	stack={stack}
	overrides={{
		kanban: {
			resolveUser: () => null,
			searchUsers: () => [],
			showAttribution: false,
		},
	}}
/>;

// @ts-expect-error A supplied Kanban override block retains its required user workflow callbacks.
StackProvider({ stack, overrides: { kanban: { showAttribution: false } } });

// @ts-expect-error Unregistered provider override keys are rejected.
StackProvider({ stack, overrides: { board: {} } });

createClientStack({
	api: { baseURL: "https://app.example.com", basePath: "/api/data" },
	site: { baseURL: "https://app.example.com", basePath: "/pages" },
	queryClient,
	plugins: {
		// @ts-expect-error Registration keys must match the literal Kanban ID.
		boards: kanbanClientPlugin(),
	},
});

const pluginOptions: KanbanClientConfig = {};
void pluginOptions;

kanbanClientPlugin({
	// @ts-expect-error Shared API origins belong to createClientStack().
	apiBaseURL: "https://api.example.com",
});
kanbanClientPlugin({
	// @ts-expect-error Shared API paths belong to createClientStack().
	apiBasePath: "/api/boards",
});
kanbanClientPlugin({
	// @ts-expect-error Shared site origins belong to createClientStack().
	siteBaseURL: "https://www.example.com",
});
kanbanClientPlugin({
	// @ts-expect-error Shared site paths belong to createClientStack().
	siteBasePath: "/boards",
});
kanbanClientPlugin({
	// @ts-expect-error The query client belongs to createClientStack().
	queryClient,
});
kanbanClientPlugin({
	// @ts-expect-error Request headers belong to createClientStack().api.
	headers: new Headers(),
});
kanbanClientPlugin({
	hooks: {
		// @ts-expect-error The canonical loader error callback is onErrorLoad.
		onLoadError: () => undefined,
	},
});
