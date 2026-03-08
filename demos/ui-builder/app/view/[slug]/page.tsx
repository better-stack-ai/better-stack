"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { QueryClientProvider } from "@tanstack/react-query";
import { StackProvider } from "@btst/stack/context";
import { PageRenderer } from "@btst/stack/plugins/ui-builder/client/components";
import type { UIBuilderPluginOverrides } from "@btst/stack/plugins/ui-builder/client";
import { functionRegistry } from "@/lib/function-registry";
import { getOrCreateQueryClient } from "@/lib/query-client";
import { ArrowLeft, Loader2, AlertCircle, FileQuestion } from "lucide-react";

type PluginOverrides = {
	"ui-builder": UIBuilderPluginOverrides;
};

export default function PublicPageView() {
	const params = useParams();
	const router = useRouter();
	const slug = params.slug as string;
	const [queryClient] = useState(() => getOrCreateQueryClient());
	const baseURL =
		typeof window !== "undefined"
			? window.location.origin
			: "http://localhost:3000";

	return (
		<QueryClientProvider client={queryClient}>
			<StackProvider<PluginOverrides>
				basePath=""
				overrides={{
					"ui-builder": {
						apiBaseURL: baseURL,
						apiBasePath: "/api/data",
						navigate: (path) => router.push(path),
						refresh: () => router.refresh(),
						Link: ({ href, ...props }) => (
							<Link href={href || "#"} {...props} />
						),
					},
				}}
			>
				<div className="min-h-screen bg-background">
					<nav className="border-b bg-background sticky top-0 z-50">
						<div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
							<Link
								href="/view"
								className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
							>
								<ArrowLeft className="h-4 w-4" />
								All pages
							</Link>
							<div className="flex items-center gap-4 text-sm">
								<code className="text-xs text-muted-foreground font-mono">
									/view/{slug}
								</code>
								<Link
									href="/pages/ui-builder"
									className="text-muted-foreground hover:text-foreground transition-colors"
								>
									Edit in builder
								</Link>
							</div>
						</div>
					</nav>

					<PageRenderer
						slug={slug}
						functionRegistry={functionRegistry}
						LoadingComponent={PageLoadingState}
						ErrorComponent={PageErrorState}
						NotFoundComponent={PageNotFoundState}
					/>
				</div>
			</StackProvider>
		</QueryClientProvider>
	);
}

function PageLoadingState() {
	return (
		<div className="flex flex-col items-center justify-center py-24 gap-3">
			<Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
			<p className="text-sm text-muted-foreground">Loading page…</p>
		</div>
	);
}

function PageErrorState({ error }: { error: Error }) {
	return (
		<div className="flex flex-col items-center justify-center py-24 gap-4 text-center px-4">
			<AlertCircle className="h-10 w-10 text-destructive" />
			<div>
				<h3 className="font-semibold text-base">Failed to load page</h3>
				<p className="text-sm text-muted-foreground mt-1">
					{error?.message || "An unexpected error occurred."}
				</p>
			</div>
			<Link href="/view" className="text-sm text-primary hover:underline">
				Back to all pages
			</Link>
		</div>
	);
}

function PageNotFoundState() {
	return (
		<div className="flex flex-col items-center justify-center py-24 gap-4 text-center px-4">
			<FileQuestion className="h-10 w-10 text-muted-foreground/50" />
			<div>
				<h3 className="font-semibold text-base">Page not found</h3>
				<p className="text-sm text-muted-foreground mt-1">
					This page doesn&apos;t exist or hasn&apos;t been published yet.
				</p>
			</div>
			<Link href="/view" className="text-sm text-primary hover:underline">
				Browse all pages
			</Link>
		</div>
	);
}
