import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { notFound } from "next/navigation";
import { getOrCreateQueryClient } from "@/lib/query-client";
import { getStackClient } from "@/lib/stack-client";
import { metaElementsToObject, normalizePath } from "@btst/stack/client";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

async function safeGetHeaders(): Promise<Headers> {
	const headersObj = new Headers();
	try {
		const { headers } = await import("next/headers");
		const headersList = await headers();
		headersList.forEach((value, key) => headersObj.set(key, value));
	} catch {
		// headers() not available in this context (e.g. WebContainers)
	}
	return headersObj;
}

export default async function Page({
	params,
}: {
	params: Promise<{ all?: string[] }>;
}) {
	const { all } = await params;
	const path = normalizePath(all);
	const headersObj = await safeGetHeaders();

	const queryClient = getOrCreateQueryClient();
	const stackClient = getStackClient(queryClient, { headers: headersObj });
	const route = stackClient.router.getRoute(path);

	if (route?.loader) await route.loader();

	return (
		<HydrationBoundary state={dehydrate(queryClient)}>
			{route?.PageComponent ? <route.PageComponent /> : notFound()}
		</HydrationBoundary>
	);
}

export async function generateMetadata({
	params,
}: {
	params: Promise<{ all?: string[] }>;
}): Promise<Metadata> {
	const { all } = await params;
	const path = normalizePath(all);
	const headersObj = await safeGetHeaders();

	const queryClient = getOrCreateQueryClient();
	const stackClient = getStackClient(queryClient, { headers: headersObj });
	const route = stackClient.router.getRoute(path);

	if (!route) return { title: "Not Found" };
	if (route?.loader) await route.loader();

	return route.meta
		? (metaElementsToObject(route.meta()) satisfies Metadata)
		: { title: "BTST AI Chat Demo" };
}
