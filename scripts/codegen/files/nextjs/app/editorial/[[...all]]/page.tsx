import { createNextPage } from "@btst/stack/next";
import { filterCredentialForwardingHeaders } from "@btst/stack/client/server";
import { headers } from "next/headers";
import { getOrCreateQueryClient } from "@/lib/query-client";
import { getRequestClientOrigins } from "@/lib/stack-client.server";
import { createEditorialClient } from "@/lib/editorial-client";
import { editorialServerAuth } from "@/lib/editorial-stack";

export const dynamic = "force-dynamic";

const page = createNextPage({
	getQueryClient: getOrCreateQueryClient,
	getStackClient: async (queryClient) => {
		const requestHeaders = new Headers(await headers());
		const identity = await editorialServerAuth.getIdentityFromHeaders({
			headers: requestHeaders,
		});
		return createEditorialClient(
			queryClient,
			getRequestClientOrigins(requestHeaders),
			filterCredentialForwardingHeaders(requestHeaders),
			identity,
		);
	},
});

export default page.Page;
export const generateMetadata = page.generateMetadata;
