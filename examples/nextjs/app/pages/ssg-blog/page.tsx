/**
 * SSG example: Blog list page with ISR + on-demand revalidation
 *
 * Uses `prefetchForRoute` (direct DB access) — the same pattern used by the
 * CMS, Forms, and Kanban SSG pages. `myStack` is stored as a global singleton
 * in `lib/stack.ts` so all Next.js module bundles (API routes and page routes)
 * share the same in-memory adapter instance.
 *
 * At build time the DB is empty; the page renders as an empty shell and ISR
 * regenerates it on the first request after deployment.
 *
 * Backend plugin hooks in `lib/stack.ts` call `revalidatePath("/pages/ssg-blog")`
 * on create/update/delete so the next visitor always gets fresh content.
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
