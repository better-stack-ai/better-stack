/**
 * SSG Blog post page with ISR + on-demand revalidation.
 *
 * New slugs are rendered on-demand (dynamicParams: true).
 * Call `revalidatePath("/pages/ssg-blog/${slug}")` in your blog backend
 * plugin hooks (lib/stack.ts) to purge the cache when a post changes.
 */
import { dehydrate, HydrationBoundary } from "@tanstack/react-query"
import { notFound } from "next/navigation"
import { getOrCreateQueryClient } from "@/lib/query-client"
import { getStackClient } from "@/lib/stack-client"
import { myStack } from "@/lib/stack"
import { normalizePath, metaElementsToObject } from "@btst/stack/client"
import type { Metadata } from "next"

export async function generateStaticParams() {
	const result = await myStack.api.blog.getAllPosts({ published: true })
	return result.items.map((post: { slug: string }) => ({ slug: post.slug }))
}

export const revalidate = 3600

export async function generateMetadata({
	params,
}: {
	params: Promise<{ slug: string }>
}): Promise<Metadata> {
	const { slug } = await params
	const queryClient = getOrCreateQueryClient()
	const stackClient = getStackClient(queryClient)
	const route = stackClient.router.getRoute(normalizePath(["blog", slug]))
	if (!route) return { title: slug }
	await myStack.api.blog.prefetchForRoute("post", queryClient, { slug })
	return metaElementsToObject(route.meta?.() ?? []) satisfies Metadata
}

export default async function SsgBlogPostPage({
	params,
}: {
	params: Promise<{ slug: string }>
}) {
	const { slug } = await params
	const queryClient = getOrCreateQueryClient()
	const stackClient = getStackClient(queryClient)
	const route = stackClient.router.getRoute(normalizePath(["blog", slug]))
	if (!route) notFound()
	await myStack.api.blog.prefetchForRoute("post", queryClient, { slug })
	return (
		<HydrationBoundary state={dehydrate(queryClient)}>
			{route.PageComponent && <route.PageComponent />}
		</HydrationBoundary>
	)
}
