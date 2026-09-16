"use client";

import { useEffect, useState, type ReactNode } from "react";
import { BtstPagesClientLayout } from "@/app/pages/client-layout";
import type { StackClientOrigins } from "@/lib/stack-client";

export function LoadingBlogClientLayout({
	children,
	clientOrigins,
}: {
	children: ReactNode;
	clientOrigins: StackClientOrigins;
}) {
	const [hydrated, setHydrated] = useState(false);
	// Model a provider update during hydration without changing authorization.
	useEffect(() => setHydrated(true), []);
	return (
		<BtstPagesClientLayout clientOrigins={clientOrigins} initialIdentity={null}>
			<div data-testid="hydration-update" data-hydrated={hydrated}>
				{children}
			</div>
		</BtstPagesClientLayout>
	);
}
