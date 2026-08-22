import { createTanStackPageOptions } from "@btst/stack/tanstack";
import { createFileRoute } from "@tanstack/react-router";
import { getStackClient } from "@/lib/stack-client";
import type { MyRouterContext } from "@/router";

export const Route = createFileRoute("/pages/$")(
	createTanStackPageOptions<MyRouterContext>({
		getStackClient,
		getLoaderStackClient: async (queryClient, { context }) => {
			void context.queryClient.getQueryCache();
			return getStackClient(queryClient);
		},
	}),
);
