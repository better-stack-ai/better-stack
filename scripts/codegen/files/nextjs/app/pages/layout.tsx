import { createNextLayout } from "@btst/stack/next/server";
import { serverAuth } from "@/lib/authorization.server";
import { BtstPagesClientLayout } from "./client-layout";

const layout = createNextLayout({
	auth: serverAuth,
	ClientLayout: BtstPagesClientLayout,
});

export default layout.Layout;
