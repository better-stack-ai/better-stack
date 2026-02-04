import { createFileRoute, notFound } from "@tanstack/react-router";
import { getStackClient } from "@/lib/stack-client";
import { normalizePath } from "@btst/stack/client";

export const Route = createFileRoute("/pages/$")({
  ssr: true,
  component: Page,
  loader: async ({ params, context }) => {
    const routePath = normalizePath(params._splat);

    const stackClient = getStackClient(context.queryClient);

    const route = stackClient.router.getRoute(routePath);

    if (!route) {
        console.log("Route not found:", routePath);
        throw notFound()
    }

    // Load data server-side if loader exists
    if (route?.loader) {
      await route.loader();
    }
    const meta = await route?.meta?.();
    return { meta };
  },
  head: ({ loaderData }) => {
    const meta = loaderData?.meta;

    if (!meta || !Array.isArray(meta)) {
      return {
        meta: [
            {
                title: "No Meta"
            }
        ],
        title: "No Meta",
      };
    }

    return {
      meta,
    };
  },
  notFoundComponent: () => {
    return <p>This page doesn't exist!</p>
  },
});

function Page() {
  const context = Route.useRouteContext();
  const { _splat } = Route.useParams();
  const stackClient = getStackClient(context.queryClient);
  const normalizedPath = normalizePath(_splat);
  const route = stackClient.router.getRoute(normalizedPath);
  const Page = route && route.PageComponent ? <route.PageComponent /> : <div>Route not found</div>;
  return Page;
}
