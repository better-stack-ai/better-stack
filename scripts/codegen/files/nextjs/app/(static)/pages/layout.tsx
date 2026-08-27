import { BtstPagesClientLayout } from "@/app/pages/client-layout";
import type { ReactNode } from "react";

export default function StaticPagesLayout({
	children,
}: {
	children?: ReactNode;
}) {
	return <BtstPagesClientLayout>{children}</BtstPagesClientLayout>;
}
