import { createRoot } from "react-dom/client";
import { QueryClient } from "@tanstack/react-query";
import { createClientStack } from "@btst/stack/client";
import { StackProvider } from "@btst/stack/context";
import { defineAuthorization } from "@btst/stack/authorization";
import { createClientAuth } from "@btst/stack/authorization/client";
import { blogClientPlugin } from "@btst/plugin-blog/client";
import { NewPostPage } from "@btst/plugin-blog/client/components";
import { PostPage } from "@btst/plugin-blog/client/pages/post";
import { blogPermissions } from "@btst/plugin-blog/permissions";
import { z } from "zod";
import "@btst/plugin-blog/css";
const post = {
	id: "packed",
	slug: "packed",
	title: "Packed reader",
	content: "# Reader heading\n\nPublic reader body",
	excerpt: "Reader excerpt",
	published: true,
	tags: [],
	createdAt: "2026-01-01T00:00:00.000Z",
	updatedAt: "2026-01-01T00:00:00.000Z",
};
globalThis.fetch = async (input, init) => {
	const url = String(input instanceof Request ? input.url : input);
	if (init?.method === "POST") {
		document.body.dataset.submitted = String(init.body);
		return Response.json(post);
	}
	if (url.includes("/tags")) return Response.json([]);
	if (url.includes("next-previous"))
		return Response.json({ previousPost: null, nextPost: null });
	if (url.includes("/posts/packed")) return Response.json(post);
	return Response.json({ items: [], total: 0 });
};
const queryClient = new QueryClient({
	defaultOptions: { queries: { retry: false, staleTime: Infinity } },
});
queryClient.setQueryData(["posts", "detail", "packed"], post);
queryClient.setQueryData(["tags", "list", "tags"], []);
const auth = createClientAuth({
	authorization: defineAuthorization({
		identity: z.object({ id: z.string() }),
		permissions: [blogPermissions],
		rules: ({ blog }) => [
			blog.post.read.allow(),
			blog.post.create.allow(),
			blog.tag.read.allow(),
		],
	}),
	getIdentity: () => ({ id: "owner" }),
});
const stack = createClientStack({
	api: { baseURL: "https://example.test", basePath: "/api" },
	site: { baseURL: "https://example.test", basePath: "/pages" },
	queryClient,
	plugins: { blog: blogClientPlugin() },
});
createRoot(document.getElementById("root")!).render(
	<StackProvider
		stack={stack}
		auth={auth}
		router={{ navigate: () => undefined }}
		overrides={{
			blog: {
				uploadImage: async () => "https://example.test/image.png",
				showAttribution: false,
			},
		}}
	>
		<section id="reader">
			<PostPage slug="packed" />
		</section>
		<section id="editor">
			<NewPostPage />
		</section>
	</StackProvider>,
);
