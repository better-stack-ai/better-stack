"use client";

import { useMemo, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StackProvider } from "@btst/stack/context";
import { createClientAuth } from "@btst/stack/authorization/client";
import { nextRouter } from "@btst/stack/next";
import type { NextClientLayoutProps } from "@btst/stack/next/server";
import { editorialAuthorization } from "@/lib/editorial-authorization";
import { createEditorialClient } from "@/lib/editorial-client";

const auth = createClientAuth({
	authorization: editorialAuthorization,
	getIdentity: () => null,
});

export function EditorialClientLayout({
	children,
	clientOrigins,
	initialIdentity,
}: NextClientLayoutProps<{ id: string; role: "user" | "admin" }>) {
	const [queryClient] = useState(() => new QueryClient());
	const stack = useMemo(
		() => createEditorialClient(queryClient, clientOrigins!),
		[queryClient, clientOrigins?.apiOrigin, clientOrigins?.siteOrigin],
	);
	return (
		<QueryClientProvider client={queryClient}>
			<StackProvider
				stack={stack}
				router={nextRouter()}
				auth={auth}
				initialIdentity={initialIdentity}
			>
				{children}
			</StackProvider>
		</QueryClientProvider>
	);
}
