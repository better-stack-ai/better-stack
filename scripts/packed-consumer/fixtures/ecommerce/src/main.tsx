import { cmsClientPlugin } from "@btst/plugin-cms/client";
import { ContentEditorPage } from "@btst/plugin-cms/client/components";
import { cmsPermissions } from "@btst/plugin-cms/permissions";
import { ecommerceClientPlugin } from "@btst/plugin-ecommerce/client";
import { ProductImagesField } from "@btst/plugin-ecommerce/client/components";
import { ecommercePermissions } from "@btst/plugin-ecommerce/permissions";
import { mediaClientPlugin } from "@btst/plugin-media/client";
import { mediaPermissions } from "@btst/plugin-media/permissions";
import "@btst/plugin-cms/css";
import "@btst/plugin-ecommerce/css";
import "@btst/plugin-media/css";
import { createClientStack } from "@btst/stack/client";
import { createClientAuth } from "@btst/stack/authorization/client";
import { defineAuthorization } from "@btst/stack/authorization";
import { StackProvider } from "@btst/stack/context";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRoot } from "react-dom/client";
import { z } from "zod";

const withMedia =
	new URL(window.location.href).searchParams.get("media") === "1";
const contentType = {
	id: "v5-product-type",
	name: "Product",
	slug: "ecommerce-product",
	jsonSchema: JSON.stringify({
		type: "object",
		properties: {
			images: {
				type: "array",
				items: { type: "string" },
				maxItems: 0,
				default: [],
				fieldType: "ecommerce-images",
				title: "Product images",
			},
		},
		required: ["images"],
	}),
	createdAt: "2026-01-01T00:00:00.000Z",
	updatedAt: "2026-01-01T00:00:00.000Z",
};
globalThis.fetch = async (input) => {
	const url =
		typeof input === "string"
			? input
			: input instanceof URL
				? input.href
				: input.url;
	if (url.endsWith("/content-types")) return Response.json([contentType]);
	if (url.includes("/inverse-relations")) return Response.json([]);
	if (url.includes("/media/assets"))
		return Response.json({ items: [], total: 0 });
	return Response.json([]);
};
const queryClient = new QueryClient({
	defaultOptions: { queries: { retry: false } },
});
const stack = createClientStack({
	api: { baseURL: window.location.origin, basePath: "/api" },
	site: { baseURL: window.location.origin, basePath: "/pages" },
	queryClient,
	plugins: {
		cms: cmsClientPlugin(),
		ecommerce: ecommerceClientPlugin(),
		...(withMedia ? { media: mediaClientPlugin() } : {}),
	},
});
const authorization = defineAuthorization({
	identity: z.object({ id: z.string() }),
	permissions: [cmsPermissions, ecommercePermissions, mediaPermissions],
	rules: ({ cms, media }) => [
		cms.contentType.read.allow(),
		cms.record.read.allow(),
		cms.record.create.allow(),
		media.library.read.allow(),
		media.asset.read.allow(),
		media.asset.upload.allow(),
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
				getIdentity: () => ({ id: "admin" }),
			})}
			overrides={{
				cms: { fieldComponents: { "ecommerce-images": ProductImagesField } },
			}}
		>
			<output id="media-registration">
				{withMedia ? "enabled" : "absent"}
			</output>
			<ContentEditorPage typeSlug="ecommerce-product" />
		</StackProvider>
	</QueryClientProvider>,
);
