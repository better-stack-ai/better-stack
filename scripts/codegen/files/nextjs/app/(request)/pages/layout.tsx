import { createNextLayout } from "@btst/stack/next/server";
import { hydrationAuth } from "@/lib/authorization.server";
import { BtstPagesClientLayout } from "@/app/pages/client-layout";
import { getRequestClientOrigins } from "@/lib/stack-client.server";

// Request identity comes from next/headers, so this subtree must render per request.
export const dynamic = "force-dynamic";

const layout = createNextLayout({
	auth: hydrationAuth,
	ClientLayout: BtstPagesClientLayout,
	resolveClientOrigins: getRequestClientOrigins,
});

export default layout.Layout;
