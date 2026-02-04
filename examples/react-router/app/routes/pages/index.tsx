import type { Route } from "./+types/index";
import { useLoaderData } from "react-router";
import {
  dehydrate,
  HydrationBoundary,
  QueryClient,
  useQueryClient
} from "@tanstack/react-query";
import { getStackClient } from "~/lib/stack-client";
import { normalizePath } from "@btst/stack/client";

export async function loader({ params }: Route.LoaderArgs) {
  // params["*"] will contain the remaining URL after files/
  const path = normalizePath(params["*"]);
  console.log({ path });
  // Create a new QueryClient for this request with the same config as the client
  // This ensures queries are configured consistently between server and client
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 1000 * 60 * 5, // 5 minutes
        refetchOnMount: false,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        retry: false,
      },
    },
  });
  const stackClient = getStackClient(queryClient);

  const route = stackClient.router.getRoute(path);
  
  // Load data server-side FIRST, before dehydrating
  if (route?.loader) {
    await route.loader();
  }
  
  // Now dehydrate the QueryClient with the loaded data
  const dehydratedState = dehydrate(queryClient);
  const meta = route?.meta?.();
  
  console.log("[SSR] Dehydrated queries:", Object.keys(dehydratedState.queries || {}).length, "queries");
  if (dehydratedState.queries && dehydratedState.queries.length > 0) {
    dehydratedState.queries.forEach((q) => {
      console.log("[SSR] - Query:", JSON.stringify(q.queryKey), "state:", q.state.status);
    });
  }
  
  return {
    path,
    dehydratedState,
    meta,
  };
}

// Note: We don't need clientLoader here because:
// 1. On initial SSR: loader runs on server and data is dehydrated
// 2. On client navigation: React Router automatically calls loader via fetch
// This ensures data is always fetched server-side, maintaining consistency

export function meta({ loaderData }: Route.MetaArgs) {
  const { meta } = loaderData;
  return meta;
}

export default function PagesIndex() {
  const loaderData = useLoaderData<typeof loader>();
  const queryClient = useQueryClient();
  const { path, dehydratedState } = loaderData;

  const route = getStackClient(queryClient).router.getRoute(path);

  const Page = route && route.PageComponent ? <route.PageComponent /> : <div>Route not found</div>;
  
  // HydrationBoundary MUST be rendered unconditionally with the dehydrated state
  // It hydrates the QueryClient synchronously before children render
  // This prevents queries from showing loading state after SSR
  if (!dehydratedState) {
    return Page;
  }
  
  return (
    <HydrationBoundary state={dehydratedState}>
      {Page}
    </HydrationBoundary>
  );
}
