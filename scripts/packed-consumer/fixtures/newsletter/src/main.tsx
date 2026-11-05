import { useEffect } from "react";
import type { CampaignSourceProps } from "@btst/plugin-newsletter/client";
import { createRoot } from "react-dom/client";
import { newsletterClientPlugin } from "@btst/plugin-newsletter/client";
import { EditCampaignPageComponent } from "@btst/plugin-newsletter/client/components";
import { newsletterPermissions } from "@btst/plugin-newsletter/permissions";
import "@btst/plugin-newsletter/css";
import { createClientStack } from "@btst/stack/client";
import { StackProvider } from "@btst/stack/context";
import { defineAuthorization } from "@btst/stack/authorization";
import { createClientAuth } from "@btst/stack/authorization/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { z } from "zod";

const queryClient = new QueryClient();
const stack = createClientStack({
	api: { baseURL: window.location.origin, basePath: "/api" },
	site: { baseURL: window.location.origin, basePath: "/pages" },
	queryClient,
	plugins: { newsletter: newsletterClientPlugin() },
});
const authorization = defineAuthorization({
	identity: z.object({ id: z.string() }),
	permissions: [newsletterPermissions],
	rules: ({ newsletter }) => [newsletter.campaign.create.allow()],
});
function CustomSource({ slug, postId, onLoad }: CampaignSourceProps) {
	useEffect(() => {
		if (slug === "source-edition" && postId === "source-1")
			onLoad("Optional source edition", "# Optional source content");
	}, [slug, postId, onLoad]);
	return <p>Custom campaign source</p>;
}
const withSource = new URL(window.location.href).searchParams.has("source");
createRoot(document.getElementById("root")!).render(
	<QueryClientProvider client={queryClient}>
		<StackProvider
			stack={stack}
			overrides={
				withSource
					? { newsletter: { CampaignSource: CustomSource } }
					: undefined
			}
			router={{ navigate: () => undefined }}
			auth={createClientAuth({
				authorization,
				getIdentity: () => ({ id: "editor" }),
			})}
		>
			<EditCampaignPageComponent />
		</StackProvider>
	</QueryClientProvider>,
);
