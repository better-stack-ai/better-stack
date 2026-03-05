"use client";
import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { QueryClientProvider } from "@tanstack/react-query";
import { StackProvider } from "@btst/stack/context";
import type { KanbanPluginOverrides } from "@btst/stack/plugins/kanban/client";
import { getOrCreateQueryClient } from "@/lib/query-client";

type PluginOverrides = { kanban: KanbanPluginOverrides };

export default function PagesLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const router = useRouter();
	const [queryClient] = useState(() => getOrCreateQueryClient());
	const baseURL =
		typeof window !== "undefined"
			? window.location.origin
			: "http://localhost:3000";

	return (
		<QueryClientProvider client={queryClient}>
			<StackProvider<PluginOverrides>
				basePath="/pages"
				overrides={{
					kanban: {
						apiBaseURL: baseURL,
						apiBasePath: "/api/data",
						navigate: (path) => router.push(path),
						refresh: () => router.refresh(),
						Link: ({ href, ...props }) => (
							<Link href={href || "#"} {...props} />
						),
						resolveUser: async () => null,
						searchUsers: async () => [],
					},
				}}
			>
				<div className="min-h-screen flex flex-col">
					<nav className="border-b bg-background sticky top-0 z-50">
						<div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
							<Link
								href="/pages/kanban"
								className="font-semibold text-lg hover:opacity-75 transition-opacity"
							>
								BTST Kanban Demo
							</Link>
							<div className="flex items-center gap-4 text-sm">
								<Link
									href="/pages/kanban"
									className="text-muted-foreground hover:text-foreground transition-colors"
								>
									Boards
								</Link>
								<a
									href="/api/data/reference"
									className="text-muted-foreground hover:text-foreground transition-colors"
								>
									API Docs
								</a>
								<Link
									href="/pages/route-docs"
									className="text-muted-foreground hover:text-foreground transition-colors"
								>
									Route Docs
								</Link>
							</div>
						</div>
					</nav>
					<main className="flex-1">{children}</main>
				</div>
			</StackProvider>
		</QueryClientProvider>
	);
}
