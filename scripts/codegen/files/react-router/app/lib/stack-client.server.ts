import type { QueryClient } from "@tanstack/react-query";
import { getStackClient } from "~/lib/stack-client";
import { serverAuth } from "~/lib/authorization.server";

export async function getStackClientForRequest(
	queryClient: QueryClient,
	request: Request,
) {
	const identity = await serverAuth.getIdentity(request);
	return getStackClient(queryClient, {
		headers: request.headers,
		currentUserId: identity?.id,
		identity: identity ?? undefined,
	});
}
