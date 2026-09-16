import { BtstPagesClientLayout } from "@/app/pages/client-layout";
import { getServerClientOrigins } from "@/lib/stack-client.server";
import type { ReactNode } from "react";

// Keep identity resolved so the loading regression measures page code, not the
// explicit session refresh exercised by the regular static layout's auth tests.
export default function LoadingBlogLayout({
	children,
}: {
	children: ReactNode;
}) {
	return (
		<BtstPagesClientLayout
			clientOrigins={getServerClientOrigins()}
			initialIdentity={null}
		>
			{children}
		</BtstPagesClientLayout>
	);
}
