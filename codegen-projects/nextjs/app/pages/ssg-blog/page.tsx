/**
 * SSG Blog list page with ISR + on-demand revalidation.
 *
 * Uses `prefetchForRoute` (direct DB access) so data is available at build time.
 * Call `revalidatePath("/pages/ssg-blog")` in your blog backend plugin hooks
 * (lib/stack.ts) to purge the cache when posts change.
 */
import { dehydrate, HydrationBoundary } from "@tanstack/react-query"
import { notFound } from "next/navigation"
import { getOrCreateQueryClient } from "@/lib/query-client"
import { getStackClient } from "@/lib/stack-client"
import { myStack } from "@/lib/stack"
import { metaElementsToObject, normalizePath } from "@btst/stack/client"
import type { Metadata } from "next"

export async function generateStaticParams() {
	return [{}]
}

export const revalidate = 3600 // ISR: regenerate at most once per hour

export async function generateMetadata(): Promise<Metadata> {
	const queryClient = getOrCreateQueryClient()
	const stackClient = getStackClient(queryClient)
	const route = stackClient.router.getRoute(normalizePath(["blog"]))
	if (!route) return { title: "Blog" }
	await myStack.api.blog.prefetchForRoute("posts", queryClient)
	return metaElementsToObject(route.meta?.() ?? []) satisfies Metadata
}

export default async function SsgBlogListPage() {
	const queryClient = getOrCreateQueryClient()
	const stackClient = getStackClient(queryClient)
	const route = stackClient.router.getRoute(normalizePath(["blog"]))
	if (!route) notFound()
	await myStack.api.blog.prefetchForRoute("posts", queryClient)
	return (
		<HydrationBoundary state={dehydrate(queryClient)}>
			{route.PageComponent && <route.PageComponent />}
		</HydrationBoundary>
	)
}
