import { useState } from "react";
import { createRoot } from "react-dom/client";
import { blogClientPlugin } from "@btst/plugin-blog/client";
import { newsletterClientPlugin } from "@btst/plugin-newsletter/client";
import { EditCampaignPageComponent } from "@btst/plugin-newsletter/client/components";
import {
	BlogCampaignSource,
	NewsletterAction,
} from "@btst/plugin-newsletter/client/blog-integration";
import { blogPermissions } from "@btst/plugin-blog/permissions";
import { newsletterPermissions } from "@btst/plugin-newsletter/permissions";
import "@btst/plugin-blog/css";
import "@btst/plugin-newsletter/css";
import { createClientStack } from "@btst/stack/client";
import { StackProvider } from "@btst/stack/context";
import { defineAuthorization } from "@btst/stack/authorization";
import { createClientAuth } from "@btst/stack/authorization/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { z } from "zod";

const params = new URLSearchParams(window.location.search);
const identity = { id: params.get("user") ?? "editor" };
const queryClient = new QueryClient({
	defaultOptions: { queries: { retry: false } },
});
const stack = createClientStack({
	api: {
		baseURL: window.location.origin,
		basePath: "/api",
	},
	site: { baseURL: window.location.origin, basePath: "/" },
	queryClient,
	endpoints: {
		blog: {
			api: { basePath: "/api", browserHeaders: { "x-user": identity.id } },
		},
		newsletter: {
			api: { basePath: "/api", browserHeaders: { "x-user": identity.id } },
		},
	},
	plugins: { blog: blogClientPlugin(), newsletter: newsletterClientPlugin() },
});
const authorization = defineAuthorization({
	identity: z.object({ id: z.string() }),
	permissions: [blogPermissions, newsletterPermissions],
	rules: ({ blog, newsletter }) => [
		blog.post.read.when(({ identity }) => identity?.id !== "no-blog"),
		newsletter.campaign.create.when(
			({ identity }) => identity?.id !== "no-create",
		),
		newsletter.campaign.read.allow(),
		newsletter.campaign.update.allow(),
		newsletter.campaign.send.when(({ identity }) => identity?.id !== "no-send"),
	],
});
function App() {
	const [location, setLocation] = useState(window.location.href);
	const navigate = (href: string) => {
		window.history.pushState(null, "", href);
		setLocation(window.location.href);
	};
	const current = new URL(location);
	const campaign = current.pathname.match(
		/\/newsletter\/campaigns\/([^/]+)$/,
	)?.[1];
	return (
		<QueryClientProvider client={queryClient}>
			<StackProvider
				stack={stack}
				router={{
					navigate,
					Link: ({ href, children, ...props }) => (
						<a
							{...props}
							href={href}
							onClick={(event) => {
								event.preventDefault();
								navigate(href ?? "/");
							}}
						>
							{children}
						</a>
					),
				}}
				auth={createClientAuth({ authorization, getIdentity: () => identity })}
				overrides={{
					blog: {
						uploadImage: async () => "https://example.test/image.png",
						editPostAction: NewsletterAction,
					},
					newsletter: { CampaignSource: BlogCampaignSource },
				}}
			>
				<NewsletterAction slug="existing-post" />
				<EditCampaignPageComponent
					key={location}
					id={campaign === "new" ? undefined : campaign}
				/>
			</StackProvider>
		</QueryClientProvider>
	);
}
createRoot(document.getElementById("root")!).render(<App />);
