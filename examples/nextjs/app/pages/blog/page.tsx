/**
 * SSG example: Blog list page
 *
 * This page demonstrates how to statically generate the blog list with
 * data pre-seeded into the query cache via the server-side API.
 *
 * Using `prefetchForRoute` bypasses the HTTP layer so this page builds
 * correctly even when no dev server is running (i.e. during `next build`).
 *
 * To enable ISR, uncomment the `revalidate` export below.
 */
import { dehydrate, HydrationBoundary } from "@tanstack/react-query"
import { notFound } from "next/navigation"
import { getOrCreateQueryClient } from "@/lib/query-client"
import { getStackClient } from "@/lib/stack-client"
import { myStack } from "@/lib/stack"
import { metaElementsToObject, normalizePath } from "@btst/stack/client"
import type { Metadata } from "next"

// Generate at build time — the blog list is a single static page
export async function generateStaticParams() {
    return [{}]
}

// export const revalidate = 3600 // uncomment to enable ISR (1 hour)

export async function generateMetadata(): Promise<Metadata> {
    const queryClient = getOrCreateQueryClient()
    const stackClient = getStackClient(queryClient)
    const route = stackClient.router.getRoute(normalizePath(["blog"]))
    if (!route) return { title: "Blog" }
    await myStack.api.blog.prefetchForRoute("posts", queryClient)
    return metaElementsToObject(route.meta?.() ?? []) satisfies Metadata
}

export default async function BlogListPage() {
    const queryClient = getOrCreateQueryClient()
    const stackClient = getStackClient(queryClient)
    const route = stackClient.router.getRoute(normalizePath(["blog"]))
    if (!route) notFound()
    // Prefetch directly from the DB — no HTTP request needed at build time
    await myStack.api.blog.prefetchForRoute("posts", queryClient)
    return (
        <HydrationBoundary state={dehydrate(queryClient)}>
            {route.PageComponent && <route.PageComponent />}
        </HydrationBoundary>
    )
}
