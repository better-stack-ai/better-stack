import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getOrCreateQueryClient } from "@/lib/query-client";
import { getStackClient } from "@/lib/stack-client";
import { metaElementsToObject, normalizePath } from "@btst/stack/client";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export default async function Page({
	params,
}: {
	params: Promise<{ all?: string[] }>;
}) {
	const { all } = await params;
	const path = normalizePath(all);
	const headersList = await headers();
	const headersObj = new Headers();
	headersList.forEach((value, key) => headersObj.set(key, value));

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
	const headersList = await headers();
	const headersObj = new Headers();
	headersList.forEach((value, key) => headersObj.set(key, value));

	const queryClient = getOrCreateQueryClient();
	const stackClient = getStackClient(queryClient, { headers: headersObj });
	const route = stackClient.router.getRoute(path);

	if (!route) return { title: "Not Found" };
	if (route?.loader) await route.loader();

	return route.meta
		? (metaElementsToObject(route.meta()) satisfies Metadata)
		: { title: "BTST AI Chat Demo" };
}
