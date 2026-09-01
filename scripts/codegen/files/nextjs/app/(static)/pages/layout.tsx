import { BtstPagesClientLayout } from "@/app/pages/client-layout";
import { getServerClientOrigins } from "@/lib/stack-client.server";
import type { ReactNode } from "react";

export default function StaticPagesLayout({
	children,
}: {
	children?: ReactNode;
}) {
	return (
		<BtstPagesClientLayout clientOrigins={getServerClientOrigins()}>
			{children}
		</BtstPagesClientLayout>
	);
}
