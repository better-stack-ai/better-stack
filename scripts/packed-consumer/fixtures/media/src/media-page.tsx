import {
	mediaClientPlugin,
	type MediaClientConfig,
} from "@btst/plugin-media/client";
import { MediaPicker } from "@btst/plugin-media/client/components";
import { mediaPermissions } from "@btst/plugin-media/permissions";
import "@btst/plugin-media/css";
import { createClientStack } from "@btst/stack/client";
import { createClientAuth } from "@btst/stack/authorization/client";
import { defineAuthorization } from "@btst/stack/authorization";
import { StackProvider } from "@btst/stack/context";
import { QueryClient } from "@tanstack/react-query";
import { createRoot } from "react-dom/client";
import { z } from "zod";

export function mountMedia(config: MediaClientConfig = {}) {
	const stack = createClientStack({
		api: { baseURL: window.location.origin, basePath: "/api" },
		site: { baseURL: window.location.origin, basePath: "/pages" },
		queryClient: new QueryClient({
			defaultOptions: { queries: { retry: false } },
		}),
		plugins: { media: mediaClientPlugin(config) },
	});
	const authorization = defineAuthorization({
		identity: z.object({ id: z.string() }),
		permissions: [mediaPermissions],
		rules: ({ media }) => [
			media.library.read.when(() => true),
			media.asset.read.when(() => true),
			media.asset.upload.when(() => true),
		],
	});
	const root = document.getElementById("root");
	if (!root) throw new Error("Missing root element");
	createRoot(root).render(
		<StackProvider
			stack={stack}
			router={{ navigate: () => undefined }}
			auth={createClientAuth({
				authorization,
				getIdentity: () => ({ id: "owner" }),
			})}
		>
			<output id="media-mode">
				{stack.provider.plugins.media.config?.uploadMode ?? "direct"}
			</output>
			<MediaPicker
				trigger={<button>Browse packed media</button>}
				onSelect={() => undefined}
			/>
		</StackProvider>,
	);
}
