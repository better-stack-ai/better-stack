import { createNextPage } from "@btst/stack/next";
import { headers } from "next/headers";
import { getOrCreateQueryClient } from "@/lib/query-client";
import { getRequestClientStack } from "@/lib/stack-client.server";

export const dynamic = "force-dynamic";

const page = createNextPage({
	getQueryClient: getOrCreateQueryClient,
	getStackClient: async (queryClient, pageProps) => {
		await pageProps.params;
		const requestHeaders = new Headers(await headers());
		return getRequestClientStack(queryClient, requestHeaders);
	},
});

export default page.Page;
export const generateMetadata = page.generateMetadata;
