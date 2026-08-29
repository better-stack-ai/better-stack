import {
	createApiClient,
	defineClientPlugin,
	defineRoute,
	type ResolvedClientPluginRuntime,
} from "@btst/stack/plugins/client";
import type { TodosApiRouter } from "../api/backend";
import { lazy } from "react";
import type { Todo } from "../types";

// Stable lazy references at module scope — must NOT be created inside route
// handlers or component bodies, otherwise React sees a new component type on
// every render and cannot hydrate the SSR-rendered HTML, causing the form's
// onSubmit handler to never attach and native GET submissions to fire instead.
const TodosListPageLazy = lazy(() =>
	import("./components").then((m) => ({ default: m.TodosListPage })),
);
const AddTodoPageLazy = lazy(() =>
	import("./components").then((m) => ({ default: m.AddTodoPage })),
);

function todosLoader(runtime: ResolvedClientPluginRuntime<"todos">) {
	return async () => {
		if (typeof window === "undefined") {
			const { api, queryClient } = runtime;

			await queryClient.prefetchQuery({
				queryKey: ["todos"],
				queryFn: async () => {
					const client = createApiClient<TodosApiRouter>({
						baseURL: api.baseURL,
						basePath: api.basePath,
						headers: api.headers,
						credentials: api.credentials,
					});
					try {
						const response = await client("/todos", {
							method: "GET",
						});
						console.log("SSR todos", response.data);
						return response.data;
					} catch (error) {
						console.error("error", error);
					}
					return [];
				},
			});
		}
	};
}

// Meta generator - configured once, accesses data via closure
function createTodosMeta(
	runtime: ResolvedClientPluginRuntime<"todos">,
	path: string,
) {
	return () => {
		const { queryClient, site } = runtime;
		const todos = queryClient.getQueryData<Todo[]>(["todos"]) ?? [];
		const fullUrl = `${site.baseURL}${site.basePath}${path}`;

		return [
			{ name: "title", content: `${todos.length} Todos` },
			{
				name: "description",
				content: `Track ${todos.length} todos. Add, toggle and delete.`,
			},
			{ name: "keywords", content: "todos, tasks, productivity" },
			// Open Graph
			{ property: "og:title", content: `${todos.length} Todos` },
			{
				property: "og:description",
				content: `Track ${todos.length} todos. Add, toggle and delete.`,
			},
			{ property: "og:type", content: "website" },
			{ property: "og:url", content: fullUrl },
			// Twitter
			{ name: "twitter:card", content: "summary" },
			{ name: "twitter:title", content: `${todos.length} Todos` },
			{
				name: "twitter:description",
				content: `Track ${todos.length} todos. Add, toggle and delete.`,
			},
		];
	};
}

// Meta generator for add todo page
function createAddTodoMeta(
	runtime: ResolvedClientPluginRuntime<"todos">,
	path: string,
) {
	return () => {
		const fullUrl = `${runtime.site.baseURL}${runtime.site.basePath}${path}`;

		return [
			{ name: "title", content: "Add Todo" },
			{ name: "description", content: "Create a new todo item." },
			{ name: "keywords", content: "add todo, create task" },
			// Open Graph
			{ property: "og:title", content: "Add Todo" },
			{ property: "og:description", content: "Create a new todo item." },
			{ property: "og:type", content: "website" },
			{ property: "og:url", content: fullUrl },
			// Twitter
			{ name: "twitter:card", content: "summary" },
			{ name: "twitter:title", content: "Add Todo" },
			{ name: "twitter:description", content: "Create a new todo item." },
		];
	};
}

/**
 * Todos client plugin
 * Provides routes, components, and React Query hooks for todos
 *
 */
function createResolvedTodosClientPlugin(
	runtime: ResolvedClientPluginRuntime<"todos">,
) {
	return {
		routes: () => ({
			todos: defineRoute("/todos", {
				page: TodosListPageLazy,
				loader: todosLoader(runtime),
				meta: createTodosMeta(runtime, "/todos"),
			}),
			addTodo: defineRoute("/todos/add", {
				page: AddTodoPageLazy,
				meta: createAddTodoMeta(runtime, "/todos/add"),
			}),
		}),
		sitemap: async () => [
			{
				url: `${runtime.site.baseURL}${runtime.site.basePath}/todos`,
				lastModified: new Date(),
				priority: 0.7,
			},
			{
				url: `${runtime.site.baseURL}${runtime.site.basePath}/todos/add`,
				lastModified: new Date(),
				priority: 0.6,
			},
		],
	};
}

export const todosClientPlugin = () =>
	defineClientPlugin({
		id: "todos",
		resolve: (runtime) => createResolvedTodosClientPlugin(runtime),
	});
