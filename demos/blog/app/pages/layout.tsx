"use client";
import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { QueryClientProvider } from "@tanstack/react-query";
import { StackProvider } from "@btst/stack/context";
import type { BlogPluginOverrides } from "@btst/stack/plugins/blog/client";
import { getOrCreateQueryClient } from "@/lib/query-client";

type PluginOverrides = {
	blog: BlogPluginOverrides;
};

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
					blog: {
						apiBaseURL: baseURL,
						apiBasePath: "/api/data",
						navigate: (path) => router.push(path),
						refresh: () => router.refresh(),
						Link: ({ href, ...props }) => (
							<Link href={href || "#"} {...props} />
						),
						uploadImage: async (_file: File) =>
							"https://placehold.co/800x400/png",
					},
				}}
			>
				<div className="min-h-screen flex flex-col">
					<nav className="border-b bg-background sticky top-0 z-50">
						<div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
							<Link
								href="/pages/blog"
								className="font-semibold text-lg hover:opacity-75 transition-opacity"
							>
								BTST Blog Demo
							</Link>
							<div className="flex items-center gap-4 text-sm">
								<Link
									href="/pages/blog"
									className="text-muted-foreground hover:text-foreground transition-colors"
								>
									Blog
								</Link>
								<a
									href="/api/data/reference"
									target="_blank"
									rel="noopener noreferrer"
									className="text-muted-foreground hover:text-foreground transition-colors"
								>
									API Docs ↗
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
