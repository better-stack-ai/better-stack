import { createNextPage } from "@btst/stack/next";
import { headers } from "next/headers";
import { getOrCreateQueryClient } from "@/lib/query-client";
import { getStackClient } from "@/lib/stack-client";

export const dynamic = "force-dynamic";

const page = createNextPage({
	getQueryClient: getOrCreateQueryClient,
	getStackClient: async (queryClient, pageProps) => {
		const requestHeaders = await headers();
		await pageProps.params;
		void requestHeaders.get("host");
		return getStackClient(queryClient);
	},
});

export default page.Page;
export const generateMetadata = page.generateMetadata;
