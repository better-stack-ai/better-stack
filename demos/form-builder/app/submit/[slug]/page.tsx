"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { QueryClientProvider } from "@tanstack/react-query";
import { StackProvider } from "@btst/stack/context";
import { FormRenderer } from "@btst/stack/plugins/form-builder/client/components";
import type { FormBuilderPluginOverrides } from "@btst/stack/plugins/form-builder/client";
import { getOrCreateQueryClient } from "@/lib/query-client";
import { ArrowLeft, Loader2, AlertCircle } from "lucide-react";

type PluginOverrides = {
	"form-builder": FormBuilderPluginOverrides;
};

export default function PublicFormPage() {
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
					"form-builder": {
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
						<div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between">
							<Link
								href="/pages/forms"
								className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
							>
								<ArrowLeft className="h-4 w-4" />
								Back to admin
							</Link>
							<span className="text-sm font-medium">
								BTST Form Builder Demo
							</span>
						</div>
					</nav>

					<main className="max-w-2xl mx-auto px-4 py-10">
						<div className="bg-card rounded-lg border p-6 shadow-sm">
							<FormRenderer
								slug={slug}
								LoadingComponent={FormLoadingState}
								ErrorComponent={FormErrorState}
								className="space-y-6"
							/>
						</div>
					</main>
				</div>
			</StackProvider>
		</QueryClientProvider>
	);
}

function FormLoadingState() {
	return (
		<div className="flex flex-col items-center justify-center py-12 gap-3">
			<Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
			<p className="text-sm text-muted-foreground">Loading form…</p>
		</div>
	);
}

function FormErrorState({ error }: { error: Error }) {
	return (
		<div className="flex flex-col items-center justify-center py-12 gap-4 text-center">
			<AlertCircle className="h-10 w-10 text-destructive" />
			<div>
				<h3 className="font-semibold text-base">Form not found</h3>
				<p className="text-sm text-muted-foreground mt-1">
					{error?.message ||
						"This form doesn't exist or is no longer accepting submissions."}
				</p>
			</div>
			<Link
				href="/pages/forms"
				className="text-sm text-primary hover:underline"
			>
				Browse all forms
			</Link>
		</div>
	);
}
