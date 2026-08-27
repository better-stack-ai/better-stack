import type { QueryClient } from "@tanstack/react-query";
import { getStackClient } from "~/lib/stack-client";

export async function getStackClientForRequest(
	queryClient: QueryClient,
	request: Request,
) {
	return getStackClient(queryClient, { headers: request.headers });
}
