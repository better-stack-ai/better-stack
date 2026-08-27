import { createNextLayout } from "@btst/stack/next/server";
import { serverAuth } from "@/lib/authorization.server";
import { BtstPagesClientLayout } from "./client-layout";

// Request identity comes from next/headers, so this subtree must render per request.
export const dynamic = "force-dynamic";

const layout = createNextLayout({
	auth: serverAuth,
	ClientLayout: BtstPagesClientLayout,
});

export default layout.Layout;
