/**
 * SSG example: Individual blog post page
 *
 * Generates a static page for every published blog post at build time.
 * `generateStaticParams` fetches all published slugs directly from the DB
 * via the server-side API so no dev server needs to be running.
 */
import { dehydrate, HydrationBoundary } from "@tanstack/react-query"
import { notFound } from "next/navigation"
import { getOrCreateQueryClient } from "@/lib/query-client"
import { getStackClient } from "@/lib/stack-client"
import { myStack } from "@/lib/stack"
import { metaElementsToObject, normalizePath } from "@btst/stack/client"
import type { Metadata } from "next"

export async function generateStaticParams() {
    const result = await myStack.api.blog.getAllPosts({ published: true })
    return result.items.map((post) => ({ slug: post.slug }))
}

// export const revalidate = 3600 // uncomment to enable ISR

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

export default async function BlogPostPage({
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
