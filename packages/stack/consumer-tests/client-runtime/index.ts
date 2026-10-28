import { QueryClient } from "@tanstack/react-query";
import {
	cmsBackendPlugin,
	getContentItemById,
	getContentItemBySlug,
	getAllContentItems,
	type CMSReadOptions,
} from "@btst/stack/plugins/cms/api";
import {
	useContent,
	useContentItem,
	useContentItemBySlug,
	useSuspenseContent,
	useSuspenseContentItem,
} from "@btst/stack/plugins/cms/client/hooks";
import type { DatabaseDefinition, DBAdapter } from "@btst/db";
import { createBackendStack } from "@btst/stack/api";
import {
	createClientStack,
	type ResolvedClientPluginRuntime,
} from "@btst/stack/client";
import { createRoute, defineClientPlugin } from "@btst/stack/plugins/client";
import {
	createDbPlugin,
	createEndpoint,
	defineBackendPlugin,
} from "@btst/stack/plugins/api";

async function cmsContentReadTypes(
	adapter: DBAdapter,
	request: Request,
	options: CMSReadOptions,
) {
	const backend = createBackendStack({
		basePath: "/api",
		adapter: () => adapter,
		plugins: { cms: cmsBackendPlugin({ contentTypes: [] }) },
	});
	const full = await backend.trusted.cms.listContentItems({
		typeSlug: "article",
		query: {},
	});
	full.items[0]!.data satisfies string;
	const content = await backend.trusted.cms.listContentItems({
		typeSlug: "article",
		query: { view: "content" },
	});
	content.items[0]!.slug satisfies string;
	// @ts-expect-error Content view omits duplicated raw JSON.
	content.items[0]!.data;
	const item = await backend
		.forRequest(request)
		.operations.cms.getContentItem({
			typeSlug: "article",
			id: "id",
			view: "content",
		});
	// @ts-expect-error Content view omits schema and editor metadata.
	item.contentType;
	const defaultItem = await backend.trusted.cms.getContentItem({
		typeSlug: "article",
		id: "id",
	});
	defaultItem.data satisfies string;
	const dynamic = await backend.trusted.cms.getContentItem({
		typeSlug: "article",
		id: "id",
		...options,
	});
	// @ts-expect-error A dynamic output view cannot promise raw JSON.
	dynamic.data;
	const getterItem = await getContentItemById(adapter, "id", {
		view: "content",
	});
	// @ts-expect-error Adapter getters have the same reduced envelope.
	getterItem?.authorId;
	(await getContentItemBySlug(adapter, "article", "slug"))?.data satisfies
		| string
		| undefined;
	const getterList = await getAllContentItems(adapter, "article", {
		view: "content",
	});
	// @ts-expect-error Content list getters omit duplicated raw JSON.
	getterList.items[0]?.data;
}
void cmsContentReadTypes;

function useCMSContentReadTypes() {
	type Types = { article: { title: string; author: string } };
	useContent<Types, "article">("article").items[0]!.data satisfies string;
	const list = useContent<Types, "article">("article", { view: "content" });
	list.items[0]!.parsedData.author satisfies string;
	// @ts-expect-error Content hooks omit editor metadata with an explicit data map too.
	list.items[0]!.contentTypeId;
	const item = useContentItem<Types, "article">("article", "id", {
		view: "content",
	});
	item.item?.parsedData.title satisfies string | undefined;
	// @ts-expect-error Content detail hooks omit raw JSON.
	item.item?.data;
	// @ts-expect-error Content slug hooks omit raw JSON.
	useContentItemBySlug("article", "slug", { view: "content" }).item?.data;
	// @ts-expect-error Suspense content list hooks omit raw JSON.
	useSuspenseContent("article", { view: "content" }).items[0]?.data;
	// @ts-expect-error Suspense content detail hooks omit raw JSON.
	useSuspenseContentItem("article", "id", { view: "content" }).item?.data;
}
void useCMSContentReadTypes;

export interface ConsumerProbeOverrides {
	label: string;
	format?: "short" | "long";
}

const observations: ResolvedClientPluginRuntime[] = [];
const probeClientPlugin = () =>
	defineClientPlugin<ConsumerProbeOverrides>()({
		id: "consumerProbe",
		resolve(runtime) {
			runtime.id satisfies "consumerProbe";
			observations.push(runtime);
			return {
				routes: () => ({
					probe: createRoute("/probe", () => ({
						PageComponent: () => null,
						loader: async () => {
							await runtime.queryClient.prefetchQuery({
								queryKey: ["consumer-probe"],
								queryFn: async () =>
									`${runtime.api.baseURL}${runtime.api.basePath}`,
							});
						},
						meta: () => [
							{
								name: "consumer-probe-site",
								content: `${runtime.site.baseURL}${runtime.site.basePath}`,
							},
						],
					})),
				}),
				sitemap: () => [
					{
						url: `${runtime.site.baseURL}${runtime.site.basePath}/probe`,
					},
				],
			};
		},
	});

probeClientPlugin().id satisfies "consumerProbe";

const queryClient = new QueryClient();
const clientStack = createClientStack({
	api: {
		baseURL: "https://app.example.com",
		basePath: "/api/data",
		headers: { cookie: "request=session" },
	},
	site: {
		baseURL: "https://app.example.com",
		basePath: "/pages",
	},
	queryClient,
	plugins: {
		consumerProbe: probeClientPlugin(),
	},
	endpoints: {
		consumerProbe: {
			api: {
				basePath: "/api/probe",
				browserHeaders: { "x-browser-safe": "public" },
			},
		},
	},
});

export const browserClientStack = createClientStack({
	api: {
		baseURL: "https://app.example.com",
		basePath: "/api/data",
	},
	site: {
		baseURL: "https://app.example.com",
		basePath: "/pages",
	},
	queryClient: new QueryClient(),
	plugins: {
		consumerProbe: probeClientPlugin(),
	},
	endpoints: {
		consumerProbe: {
			api: {
				basePath: "/api/probe",
				browserHeaders: { "x-browser-safe": "public" },
			},
		},
	},
});

clientStack.provider.queryClient satisfies QueryClient;
clientStack.provider.plugins.consumerProbe.id satisfies "consumerProbe";
clientStack.provider.plugins.consumerProbe.api.basePath satisfies string;
browserClientStack.provider.queryClient satisfies QueryClient;
browserClientStack.provider.plugins.consumerProbe.api.basePath satisfies string;
browserClientStack.provider.plugins.consumerProbe.api.browserHeaders satisfies
	| Headers
	| undefined;
observations[0]?.api.headers satisfies Headers | undefined;
observations[0]?.id satisfies string | undefined;
// @ts-expect-error Request headers do not exist on the top-level provider projection.
clientStack.provider.api.headers;

createClientStack({
	// @ts-expect-error Shared origins must be qualified under api or site.
	baseURL: "https://ignored.example.com",
	api: { baseURL: "https://app.example.com", basePath: "/api/data" },
	site: { baseURL: "https://app.example.com", basePath: "/pages" },
	queryClient,
	plugins: { consumerProbe: probeClientPlugin() },
});

createClientStack({
	// @ts-expect-error Shared paths must be qualified under api or site.
	basePath: "/ignored",
	api: { baseURL: "https://app.example.com", basePath: "/api/data" },
	site: { baseURL: "https://app.example.com", basePath: "/pages" },
	queryClient,
	plugins: { consumerProbe: probeClientPlugin() },
});

createClientStack({
	api: { baseURL: "https://app.example.com", basePath: "/api/data" },
	site: { baseURL: "https://app.example.com", basePath: "/pages" },
	queryClient,
	plugins: { consumerProbe: probeClientPlugin() },
	endpoints: {
		consumerProbe: {
			// @ts-expect-error A replacement origin requires its own basePath.
			api: { baseURL: "https://plugins.example.net" },
		},
	},
});

createClientStack({
	api: { baseURL: "https://app.example.com", basePath: "/api/data" },
	site: { baseURL: "https://app.example.com", basePath: "/pages" },
	queryClient,
	plugins: {
		// @ts-expect-error Registration aliases cannot diverge from a canonical ID.
		alias: probeClientPlugin(),
	},
});

const probeBackendPlugin = () =>
	defineBackendPlugin({
		id: "consumerProbe",
		dbPlugin: createDbPlugin("consumer-probe", {}),
		routes: () => ({
			probe: createEndpoint("/probe", { method: "GET" }, async () => ({
				ok: true,
			})),
		}),
	});

probeBackendPlugin().id satisfies "consumerProbe";

createBackendStack({
	basePath: "/api/data",
	plugins: { consumerProbe: probeBackendPlugin() },
	adapter: (_db: DatabaseDefinition) => null as unknown as DBAdapter,
});

createBackendStack({
	basePath: "/api/data",
	plugins: {
		// @ts-expect-error Backend registration aliases cannot diverge from a canonical ID.
		alias: probeBackendPlugin(),
	},
	adapter: (_db: DatabaseDefinition) => null as unknown as DBAdapter,
});

createClientStack({
	api: { baseURL: "https://app.example.com", basePath: "/api/data" },
	site: { baseURL: "https://app.example.com", basePath: "/pages" },
	queryClient,
	plugins: { consumerProbe: probeClientPlugin() },
	endpoints: {
		// @ts-expect-error Replacements are limited to registered plugin keys.
		missing: { api: { basePath: "/api/missing" } },
	},
});
