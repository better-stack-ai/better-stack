import type { Route } from "./+types/$"
import { useLoaderData, useRouteError } from "react-router"
import { dehydrate, HydrationBoundary, useQueryClient } from "@tanstack/react-query"
import { normalizePath } from "@btst/stack/client"
import { getOrCreateQueryClient } from "~/lib/query-client"
import { getStackClient } from "~/lib/stack-client"

export async function loader({ params }: Route.LoaderArgs) {
	const queryClient = getOrCreateQueryClient()
	const path = normalizePath(params["*"])
	const route = getStackClient(queryClient).router.getRoute(path)

	if (route?.loader) {
		await route.loader()
	}

	return {
		path,
		dehydratedState: dehydrate(queryClient),
		meta: route?.meta?.(),
	}
}

export function meta({ loaderData }: Route.MetaArgs) {
	return loaderData.meta
}

export default function BtstPagesRoute() {
	const data = useLoaderData<typeof loader>()
	const queryClient = useQueryClient()
	const route = getStackClient(queryClient).router.getRoute(data.path)
	const page = route?.PageComponent ? <route.PageComponent /> : <div>Route not found</div>

	return (
		<HydrationBoundary state={data.dehydratedState}>
			{page}
		</HydrationBoundary>
	)
}

export function ErrorBoundary() {
	const error = useRouteError()
	return <pre>{String(error)}</pre>
}
