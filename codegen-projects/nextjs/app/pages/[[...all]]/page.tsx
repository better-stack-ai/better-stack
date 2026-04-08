import { dehydrate, HydrationBoundary } from "@tanstack/react-query"
import { normalizePath, metaElementsToObject } from "@btst/stack/client"
import { notFound } from "next/navigation"
import { getOrCreateQueryClient } from "@/lib/query-client"
import { getStackClient } from "@/lib/stack-client"
import type { Metadata } from "next"

export const dynamic = "force-dynamic"

export default async function BtstPagesRoute({
	params,
}: {
	params: Promise<{ all?: string[] }>
}) {
	const pathParams = await params
	const path = normalizePath(pathParams?.all)
	const queryClient = getOrCreateQueryClient()
	const stackClient = getStackClient(queryClient)
	const route = stackClient.router.getRoute(path)

	if (route?.loader) {
		await route.loader()
	}

	return (
		<HydrationBoundary state={dehydrate(queryClient)}>
			{route?.PageComponent ? <route.PageComponent /> : notFound()}
		</HydrationBoundary>
	)
}

export async function generateMetadata({
	params,
}: {
	params: Promise<{ all?: string[] }>
}): Promise<Metadata> {
	const pathParams = await params
	const path = normalizePath(pathParams?.all)
	const queryClient = getOrCreateQueryClient()
	const stackClient = getStackClient(queryClient)
	const route = stackClient.router.getRoute(path)
	if (!route?.meta) {
		return {}
	}
	if (route?.loader) {
		await route.loader()
	}
	return metaElementsToObject(route.meta()) satisfies Metadata
}
