import { createNextLayout } from "@btst/stack/next/server";
import { editorialServerAuth } from "@/lib/editorial-stack";
import { getRequestClientOrigins } from "@/lib/stack-client.server";
import { EditorialClientLayout } from "./client-layout";

export const dynamic = "force-dynamic";

const layout = createNextLayout({
	auth: editorialServerAuth,
	ClientLayout: EditorialClientLayout,
	resolveClientOrigins: getRequestClientOrigins,
});

export default layout.Layout;
