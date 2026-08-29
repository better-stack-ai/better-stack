import { headers } from "next/headers";
import { ClientOriginsProvider } from "@/lib/client-origins";
import { getRequestClientOrigins } from "@/lib/stack-client.server";

export default async function DirectoryLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const origins = getRequestClientOrigins(new Headers(await headers()));
	return (
		<ClientOriginsProvider origins={origins}>{children}</ClientOriginsProvider>
	);
}
