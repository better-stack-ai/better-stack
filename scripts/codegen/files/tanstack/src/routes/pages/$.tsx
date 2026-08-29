import { createTanStackPageOptions } from "@btst/stack/tanstack";
import { createFileRoute } from "@tanstack/react-router";
import { createIsomorphicFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import type { QueryClient } from "@tanstack/react-query";
import { getStackClient } from "@/lib/stack-client";
import { getRequestClientStack } from "@/lib/stack-client.server";
import { getInitialIdentity } from "@/lib/authorization.identity";
import type { MyRouterContext } from "@/router";

const getLoaderClientStack = createIsomorphicFn()
	.server(async (queryClient: QueryClient) => {
		const request = getRequest();
		return getRequestClientStack(queryClient, request);
	})
	.client(async (queryClient: QueryClient) => {
		const { apiOrigin, siteOrigin } = await getInitialIdentity();
		return getStackClient(queryClient, { apiOrigin, siteOrigin });
	});

export const Route = createFileRoute("/pages/$")(
	createTanStackPageOptions<MyRouterContext>({
		getStackClient,
		getLoaderStackClient: async (queryClient, { context }) => {
			void context.queryClient.getQueryCache();
			return getLoaderClientStack(queryClient);
		},
	}),
);
