import { createTanStackPageOptions } from "@btst/stack/tanstack";
import { createFileRoute } from "@tanstack/react-router";
import { createIsomorphicFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { getStackClient } from "@/lib/stack-client";
import type { MyRouterContext } from "@/router";

const getLoaderRequestHeaders = createIsomorphicFn()
	.server(() => getRequest().headers)
	.client(() => undefined);

export const Route = createFileRoute("/pages/$")(
	createTanStackPageOptions<MyRouterContext>({
		getStackClient,
		getLoaderStackClient: async (queryClient, { context }) => {
			void context.queryClient.getQueryCache();
			return getStackClient(queryClient, {
				headers: getLoaderRequestHeaders(),
			});
		},
	}),
);
