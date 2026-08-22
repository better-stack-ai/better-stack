import type { QueryClient } from "@tanstack/react-query";
import { getStackClient } from "~/lib/stack-client";

export async function getStackClientForRequest(
	queryClient: QueryClient,
	request: Request,
) {
	void request.headers.get("host");
	return getStackClient(queryClient);
}
