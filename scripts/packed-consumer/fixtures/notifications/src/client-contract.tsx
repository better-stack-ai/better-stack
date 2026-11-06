import { QueryClient } from "@tanstack/react-query";
import { createClientStack } from "@btst/stack/client";
import { notificationsClientPlugin } from "@btst/plugin-notifications/client";
const stack = createClientStack({
	api: { baseURL: "https://example.test", basePath: "/api" },
	site: { baseURL: "https://example.test", basePath: "/pages" },
	queryClient: new QueryClient(),
	plugins: {
		notifications: notificationsClientPlugin({
			identityPartition: { id: "alice" },
		}),
	},
});
notificationsClientPlugin({
	// @ts-expect-error Shared API configuration belongs to the resolved client stack.
	apiBaseURL: "https://example.test",
});
void stack;
