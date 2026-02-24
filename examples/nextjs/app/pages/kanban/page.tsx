/**
 * SSG example: Kanban boards list page
 *
 * Statically generates the kanban boards list by prefetching directly from
 * the DB. No dev server needs to be running during `next build`.
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

// export const revalidate = 3600 // uncomment to enable ISR

export async function generateMetadata(): Promise<Metadata> {
    const queryClient = getOrCreateQueryClient()
    const stackClient = getStackClient(queryClient)
    const route = stackClient.router.getRoute(normalizePath(["kanban"]))
    if (!route) return { title: "Kanban Boards" }
    await myStack.api.kanban.prefetchForRoute("boards", queryClient)
    return metaElementsToObject(route.meta?.() ?? []) satisfies Metadata
}

export default async function KanbanBoardsPage() {
    const queryClient = getOrCreateQueryClient()
    const stackClient = getStackClient(queryClient)
    const route = stackClient.router.getRoute(normalizePath(["kanban"]))
    if (!route) notFound()
    await myStack.api.kanban.prefetchForRoute("boards", queryClient)
    return (
        <HydrationBoundary state={dehydrate(queryClient)}>
            {route.PageComponent && <route.PageComponent />}
        </HydrationBoundary>
    )
}
