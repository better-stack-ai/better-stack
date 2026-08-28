import { createNextPage } from "@btst/stack/next";
import { headers } from "next/headers";
import { getOrCreateQueryClient } from "@/lib/query-client";
import { getStackClient } from "@/lib/stack-client";
import { hydrationAuth } from "@/lib/authorization.server";

export const dynamic = "force-dynamic";

const page = createNextPage({
	getQueryClient: getOrCreateQueryClient,
	getStackClient: async (queryClient, pageProps) => {
		await pageProps.params;
		const requestHeaders = new Headers(await headers());
		const initialIdentity = await hydrationAuth.getIdentityFromHeaders({
			headers: requestHeaders,
		});
		return getStackClient(queryClient, {
			headers: requestHeaders,
			currentUserId: initialIdentity?.id,
			identity: initialIdentity ?? undefined,
		});
	},
});

export default page.Page;
export const generateMetadata = page.generateMetadata;
