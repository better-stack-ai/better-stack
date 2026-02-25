/**
 * SSG example: Forms list page with ISR
 *
 * Statically generates the forms list page at build time.
 * When a form is created/updated/deleted, the backend plugin hooks in
 * lib/stack.ts call revalidatePath('/pages/ssg-forms', 'page') to
 * trigger regeneration on the next request.
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
    return [{}]
}

export const revalidate = 3600 // ISR: regenerate at most once per hour

export async function generateMetadata(): Promise<Metadata> {
    const queryClient = getOrCreateQueryClient()
    const stackClient = getStackClient(queryClient)
    const route = stackClient.router.getRoute(normalizePath(["forms"]))
    if (!route) return { title: "Forms" }
    await myStack.api.formBuilder.prefetchForRoute("formList", queryClient)
    return metaElementsToObject(route.meta?.() ?? []) satisfies Metadata
}

export default async function SsgFormsListPage() {
    const queryClient = getOrCreateQueryClient()
    const stackClient = getStackClient(queryClient)
    const route = stackClient.router.getRoute(normalizePath(["forms"]))
    if (!route) notFound()
    await myStack.api.formBuilder.prefetchForRoute("formList", queryClient)
    return (
        <HydrationBoundary state={dehydrate(queryClient)}>
            {route.PageComponent && <route.PageComponent />}
        </HydrationBoundary>
    )
}
