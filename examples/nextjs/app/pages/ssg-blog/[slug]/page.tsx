/**
 * SSG example: Individual blog post page with ISR + on-demand revalidation
 *
 * Uses `prefetchForRoute` (direct DB access). `myStack` is stored as a global
 * singleton in `lib/stack.ts` so all Next.js module bundles share the same
 * in-memory adapter instance — the post created via the API is visible here.
 *
 * New slugs are rendered on-demand (dynamicParams: true), so posts created
 * after the build are served fresh on their first visit.
 *
 * Backend plugin hooks in `lib/stack.ts` call `revalidatePath` on
 * create/update/delete to purge the ISR cache on demand.
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
