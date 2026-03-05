import { QueryClient, isServer } from "@tanstack/react-query";

function makeQueryClient() {
	return new QueryClient({
		defaultOptions: {
			queries: {
				staleTime: isServer ? 60 * 1000 : 0,
				refetchOnMount: false,
				refetchOnWindowFocus: false,
				retry: false,
			},
			dehydrate: {
				shouldDehydrateQuery: () => true,
			},
		},
	});
}

let browserQueryClient: QueryClient | undefined = undefined;

export function getOrCreateQueryClient() {
	if (isServer) {
		return makeQueryClient();
	}
	if (!browserQueryClient) browserQueryClient = makeQueryClient();
	return browserQueryClient;
}
