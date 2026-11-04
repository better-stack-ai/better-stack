import { cmsClientPlugin } from "@btst/plugin-cms/client";
import { useContentTypes } from "@btst/plugin-cms/client/hooks";
import "@btst/plugin-cms/css";
import { createClientStack } from "@btst/stack/client";
import { StackProvider } from "@btst/stack/context";
import { QueryClient } from "@tanstack/react-query";
import { createRoot } from "react-dom/client";

globalThis.fetch = async () =>
	Response.json([
		{
			id: "article-type",
			slug: "article",
			name: "Packed articles",
			jsonSchema: "{}",
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
		},
	]);

const stack = createClientStack({
	api: { baseURL: "https://example.test", basePath: "/api" },
	site: { baseURL: "https://example.test", basePath: "/pages" },
	queryClient: new QueryClient(),
	plugins: { cms: cmsClientPlugin() },
});

function Content() {
	const { contentTypes } = useContentTypes();
	return <output id="packed-cms">{contentTypes[0]?.name}</output>;
}

const root = document.getElementById("root");
if (!root) throw new Error("Missing root element");
createRoot(root).render(
	<StackProvider stack={stack} router={{ navigate: () => undefined }}>
		<Content />
	</StackProvider>,
);
