
import { dehydrate, HydrationBoundary } from "@tanstack/react-query"
import { headers } from "next/headers"
import { notFound } from "next/navigation"
import { getOrCreateQueryClient } from "@/lib/query-client"
import { getStackClient } from "@/lib/stack-client"
import { metaElementsToObject, normalizePath } from "@btst/stack/client"
import { Metadata } from "next"


export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function ExamplePage({
    params
}: {
    params: Promise<{ all: string[] }>
}) {
    const pathParams = await params
    const path = normalizePath(pathParams?.all)

    // Create a queryClient for this request
    const queryClient = getOrCreateQueryClient()

    // Get headers from the incoming request (includes cookies for auth)
    const headersList = await headers()
    // Convert Next.js ReadonlyHeaders to standard Headers object
    const headersObj = new Headers()
    headersList.forEach((value, key) => {
        headersObj.set(key, value)
    })

    // Pass headers to stack client - this enables authentication in SSR
    const stackClient = getStackClient(queryClient, {
        headers: headersObj
    })

    const route = stackClient.router.getRoute(path)

    // Load data server-side if loader exists
    if (route?.loader) {
        await route.loader()
    }
    
    // Dehydrate with errors included so client doesn't refetch on error
    const dehydratedState = dehydrate(queryClient)
    console.log("[SSR] Dehydrated queries:", Object.keys(dehydratedState.queries || {}).length, "queries")
    if (dehydratedState.queries && dehydratedState.queries.length > 0) {
        dehydratedState.queries.forEach((q) => {
            console.log("[SSR] - Query:", JSON.stringify(q.queryKey), "state:", q.state.status)
        })
    }

    // Pass path to client resolver which has access to router via closure
    return (
        <HydrationBoundary state={dehydratedState}>
            {route && route.PageComponent ? <route.PageComponent /> : notFound()}
        </HydrationBoundary>
    )

}

//meta
export async function generateMetadata({ params }: { params: Promise<{ all: string[] }> }): Promise<Metadata> {
    const pathParams = await params
    const path = normalizePath(pathParams?.all)
    // Create a queryClient for this request
    const queryClient = getOrCreateQueryClient()
    
    // Get headers for metadata generation as well
    const headersList = await headers()
    // Convert Next.js ReadonlyHeaders to standard Headers object
    const headersObj = new Headers()
    headersList.forEach((value, key) => {
        headersObj.set(key, value)
    })
    
    const stackClient = getStackClient(queryClient, {
        headers: headersObj
    })
    const route = stackClient.router.getRoute(path)
    if (!route) {
        return notFound()
    }
    if (!route.meta) {
        return {
            title: "No meta for this route"
        }
    }
    
    // Load data for metadata if loader exists
    if (route?.loader) {
        await route.loader()
    }
    
    return metaElementsToObject(route.meta()) satisfies Metadata
}
