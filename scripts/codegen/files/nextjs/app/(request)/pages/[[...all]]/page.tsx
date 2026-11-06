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
		const searchParams = new URLSearchParams();
		for (const [key, value] of Object.entries(
			(await pageProps.searchParams) ?? {},
		)) {
			for (const item of Array.isArray(value)
				? value
				: value === undefined
					? []
					: [value])
				searchParams.append(key, item);
		}
		return getRequestClientStack(queryClient, requestHeaders, searchParams);
	},
});

export default page.Page;
export const generateMetadata = page.generateMetadata;
