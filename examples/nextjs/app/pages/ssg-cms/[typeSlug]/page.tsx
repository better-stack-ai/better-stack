/**
 * SSG example: CMS content list page with Next.js cache tags
 *
 * Generates a static page for each registered content type at build time.
 * Data is tagged with `'ssg-cms-${typeSlug}'` so that mutations via the
 * backend plugin hooks (lib/stack.ts → revalidatePath) trigger regeneration
 * on the next request.
 *
 * ISR (`revalidate = 3600`) provides a time-based fallback.
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
    return contentTypes.map((ct: { slug: string }) => ({ typeSlug: ct.slug }))
}

export const revalidate = 3600 // ISR: regenerate at most once per hour

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

export default async function SsgCmsContentListPage({
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
