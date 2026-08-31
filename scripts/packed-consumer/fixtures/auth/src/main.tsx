import {
	accountClientPlugin,
	authClientPlugin,
} from "@btst/better-auth-ui/client";
import { createClientStack } from "@btst/stack/client";
import { StackProvider } from "@btst/stack/context";
import { QueryClient } from "@tanstack/react-query";
import { createAuthClient } from "better-auth/react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

const authClient = createAuthClient();
const stack = createClientStack({
	api: { baseURL: "https://example.test", basePath: "/api/data" },
	site: { baseURL: "https://example.test", basePath: "/pages" },
	queryClient: new QueryClient(),
	plugins: {
		auth: authClientPlugin(),
		account: accountClientPlugin(),
	},
});

const root = document.getElementById("root");
if (!root) throw new Error("Missing root element");

createRoot(root).render(
	<StrictMode>
		<StackProvider
			stack={stack}
			overrides={{
				auth: {
					authClient,
					credentials: true,
				},
				account: {
					account: true,
					avatar: { extension: "png", size: 128 },
				},
			}}
		>
			<main>BTST packed auth and account consumer</main>
		</StackProvider>
	</StrictMode>,
);
