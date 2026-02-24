/**
 * SSG example: CMS content list page
 *
 * Generates a static page for every registered content type at build time.
 * `generateStaticParams` fetches all content type slugs directly from the DB.
 *
 * Note: `prefetchForRoute("contentList")` calls `ensureSynced()` once at the
 * top. During concurrent SSG (generateStaticParams + generateMetadata + page),
 * `ensureSynced` is idempotent — subsequent calls reuse the same Promise so
 * schema sync only runs once per build process.
 */
import { dehydrate, HydrationBoundary } from "@tanstack/react-query"
import { notFound } from "next/navigation"
import { getOrCreateQueryClient } from "@/lib/query-client"
import { getStackClient } from "@/lib/stack-client"
import { myStack } from "@/lib/stack"
import { metaElementsToObject, normalizePath } from "@btst/stack/client"
import type { Metadata } from "next"

export async function generateStaticParams() {
    const contentTypes = await myStack.api.cms.getAllContentTypes()
    return contentTypes.map((ct) => ({ typeSlug: ct.slug }))
}

// export const revalidate = 3600 // uncomment to enable ISR

export async function generateMetadata({
    params,
}: {
    params: Promise<{ typeSlug: string }>
}): Promise<Metadata> {
    const { typeSlug } = await params
    const queryClient = getOrCreateQueryClient()
    const stackClient = getStackClient(queryClient)
    const route = stackClient.router.getRoute(normalizePath(["cms", typeSlug]))
    if (!route) return { title: typeSlug }
    await myStack.api.cms.prefetchForRoute("contentList", queryClient, { typeSlug })
    return metaElementsToObject(route.meta?.() ?? []) satisfies Metadata
}

export default async function CMSContentListPage({
    params,
}: {
    params: Promise<{ typeSlug: string }>
}) {
    const { typeSlug } = await params
    const queryClient = getOrCreateQueryClient()
    const stackClient = getStackClient(queryClient)
    const route = stackClient.router.getRoute(normalizePath(["cms", typeSlug]))
    if (!route) notFound()
    await myStack.api.cms.prefetchForRoute("contentList", queryClient, { typeSlug })
    return (
        <HydrationBoundary state={dehydrate(queryClient)}>
            {route.PageComponent && <route.PageComponent />}
        </HydrationBoundary>
    )
}
