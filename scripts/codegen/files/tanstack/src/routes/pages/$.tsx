import { createFileRoute, notFound } from "@tanstack/react-router";
import { normalizePath } from "@btst/stack/client";
import { getStackClient } from "@/lib/stack-client";

export const Route = createFileRoute("/pages/$")({
	ssr: true,
	component: BtstPagesRoute,
	loader: async ({ params, context }) => {
		const queryClient = context.queryClient;
		const routePath = normalizePath(params._splat);
		const route = getStackClient(queryClient).router.getRoute(routePath);
		if (!route) throw notFound();
		if (route.loader) await route.loader();
		return { meta: route.meta?.() };
	},
	head: ({ loaderData }) => {
		if (!loaderData?.meta || !Array.isArray(loaderData.meta)) {
			return { title: "No Meta", meta: [{ title: "No Meta" }] };
		}
		return { meta: loaderData.meta };
	},
});

function BtstPagesRoute() {
	const params = Route.useParams();
	const { queryClient } = Route.useRouteContext();
	const routePath = normalizePath(params._splat);
	const route = getStackClient(queryClient).router.getRoute(routePath);
	return route?.PageComponent ? (
		<route.PageComponent />
	) : (
		<div>Route not found</div>
	);
}
