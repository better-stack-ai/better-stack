import { createTanStackPageOptions } from "@btst/stack/tanstack";
import { createFileRoute } from "@tanstack/react-router";
import { createIsomorphicFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { getStackClient } from "@/lib/stack-client";
import { serverAuth } from "@/lib/authorization.server";
import type { MyRouterContext } from "@/router";

const getLoaderAuthContext = createIsomorphicFn()
	.server(async () => {
		const request = getRequest();
		const identity = await serverAuth.getIdentity(request);
		return { headers: request.headers, currentUserId: identity?.id };
	})
	.client(() => ({ headers: undefined, currentUserId: undefined }));

export const Route = createFileRoute("/pages/$")(
	createTanStackPageOptions<MyRouterContext>({
		getStackClient,
		getLoaderStackClient: async (queryClient, { context }) => {
			void context.queryClient.getQueryCache();
			const { headers, currentUserId } = await getLoaderAuthContext();
			return getStackClient(queryClient, {
				headers,
				currentUserId,
			});
		},
	}),
);
