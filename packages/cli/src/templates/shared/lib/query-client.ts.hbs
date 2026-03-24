import { QueryClient, isServer } from "@tanstack/react-query"
import { cache } from "react"

function makeQueryClient() {
	return new QueryClient({
		defaultOptions: {
			queries: {
				staleTime: isServer ? 60 * 1000 : 0,
				refetchOnMount: false,
				refetchOnWindowFocus: false,
				refetchOnReconnect: false,
				retry: false,
			},
			dehydrate: {
				shouldDehydrateQuery: () => true,
			},
		},
	})
}

let browserQueryClient: QueryClient | undefined

const getServerQueryClient = cache(() => makeQueryClient())

export function getOrCreateQueryClient() {
	if (isServer) return getServerQueryClient()
	if (!browserQueryClient) browserQueryClient = makeQueryClient()
	return browserQueryClient
}
