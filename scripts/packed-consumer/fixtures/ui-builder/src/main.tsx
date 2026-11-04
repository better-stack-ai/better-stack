import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRoot } from "react-dom/client";
import { z } from "zod";
import { createClientStack } from "@btst/stack/client";
import { StackProvider } from "@btst/stack/context";
import { defineAuthorization } from "@btst/stack/authorization";
import { createClientAuth } from "@btst/stack/authorization/client";
import { cmsClientPlugin } from "@btst/plugin-cms/client";
import { cmsPermissions } from "@btst/plugin-cms/permissions";
import { UI_BUILDER_TYPE_SLUG } from "@btst/plugin-ui-builder";
import {
	uiBuilderClientPlugin,
	defaultComponentRegistry,
} from "@btst/plugin-ui-builder/client";
import {
	PageRenderer,
	PageBuilderPage,
} from "@btst/plugin-ui-builder/client/components";
import "@btst/plugin-ui-builder/css";

const layers = [
	{
		id: "packed-root",
		type: "FixtureText",
		name: "Packed UI page",
		props: { text: "Rendered from packed UI Builder" },
		children: [],
	},
];
const pageData = {
	layers: JSON.stringify(layers),
	variables: "[]",
	status: "published",
};
const existingPage = {
	id: "legacy-ui-page",
	contentTypeId: "legacy-ui-type",
	slug: "packed-page",
	authorId: "owner",
	data: JSON.stringify(pageData),
	parsedData: pageData,
	createdAt: "2024-01-01T00:00:00.000Z",
	updatedAt: "2024-01-02T00:00:00.000Z",
};

globalThis.fetch = async (_input, init) => {
	if (init?.method === "PUT") {
		const body = JSON.parse(String(init.body));
		(window as any).__savedUIPage = body.data;
		return Response.json({
			...existingPage,
			data: JSON.stringify(body.data),
			parsedData: body.data,
		});
	}
	const url = String(_input);
	return Response.json(
		url.endsWith("/legacy-ui-page")
			? existingPage
			: { items: [existingPage], total: 1, limit: 20, offset: 0 },
	);
};

const components = {
	...defaultComponentRegistry,
	FixtureText: {
		component: ({ text }: { text: string }) => (
			<p data-testid="packed-renderer">{text}</p>
		),
		schema: z.object({ text: z.string() }),
	},
};
const queryClient = new QueryClient({
	defaultOptions: { queries: { retry: false } },
});
const stack = createClientStack({
	api: { baseURL: "https://example.test", basePath: "/api" },
	site: { baseURL: "https://example.test", basePath: "/pages" },
	queryClient,
	plugins: {
		cms: cmsClientPlugin(),
		uiBuilder: uiBuilderClientPlugin({ components }),
	},
});
const authorization = defineAuthorization({
	identity: z.object({ id: z.string() }),
	permissions: [cmsPermissions],
	rules: ({ cms }) => [
		cms.contentType.read.allow(),
		cms.record.read.allow(),
		cms.record.update.allow(),
	],
});
const root = document.getElementById("root");
if (!root) throw new Error("Missing root element");
createRoot(root).render(
	<QueryClientProvider client={queryClient}>
		<StackProvider
			stack={stack}
			router={{ navigate: () => undefined }}
			auth={createClientAuth({
				authorization,
				getIdentity: () => ({ id: "owner" }),
			})}
			initialIdentity={{ id: "owner" }}
			notify={{
				success: (message) => {
					(window as any).__uiSavedMessage = message;
				},
				error: (message) => {
					throw new Error(message);
				},
			}}
		>
			<PageRenderer slug="packed-page" />
			<div style={{ height: 650 }}>
				<PageBuilderPage id="legacy-ui-page" />
			</div>
			<output id="packed-type">{UI_BUILDER_TYPE_SLUG}</output>
		</StackProvider>
	</QueryClientProvider>,
);
