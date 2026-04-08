"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { QueryClientProvider } from "@tanstack/react-query"
import { StackProvider } from "@btst/stack/context"
import { getOrCreateQueryClient } from "@/lib/query-client"
import {
	PageRenderer,
	defaultComponentRegistry,
} from "@btst/stack/plugins/ui-builder/client"
import type { UIBuilderPluginOverrides } from "@btst/stack/plugins/ui-builder/client"

const getBaseURL = () =>
	typeof window !== "undefined"
		? window.location.origin
		: process.env.NEXT_PUBLIC_SITE_URL || process.env.BASE_URL || "http://localhost:3000"

type PluginOverrides = {
	"ui-builder": UIBuilderPluginOverrides
}

interface PreviewPageClientProps {
	slug: string
}

/**
 * Renders a published UI Builder page by slug.
 * Access at: /preview/<page-slug>
 */
export default function PreviewPageClient({ slug }: PreviewPageClientProps) {
	const [queryClient] = useState(() => getOrCreateQueryClient())
	const router = useRouter()
	const baseURL = getBaseURL()

	return (
		<QueryClientProvider client={queryClient}>
			<StackProvider<PluginOverrides>
				basePath="/preview"
				overrides={
				{
					"ui-builder": {
						apiBaseURL: baseURL,
						apiBasePath: "/api/data",
						componentRegistry: defaultComponentRegistry,
						navigate: (path) => router.push(path),
						refresh: () => router.refresh(),
						Link: ({ href, ...props }) => <Link href={href || "#"} {...props} />,
					},
				}
				}
			>
				<div className="min-h-screen">
					<PageRenderer
						slug={slug}
						componentRegistry={defaultComponentRegistry}
						className="w-full"
						NotFoundComponent={() => (
							<div className="flex flex-col items-center justify-center min-h-[400px] text-center p-8">
								<h1 className="text-2xl font-bold mb-2">Page Not Found</h1>
								<p className="text-muted-foreground mb-4">
									The page &ldquo;{slug}&rdquo; does not exist.
								</p>
								<Link href="/pages/ui-builder" className="text-primary hover:underline">
									Go to UI Builder
								</Link>
							</div>
						)}
						ErrorComponent={({ error }) => (
							<div className="flex flex-col items-center justify-center min-h-[400px] text-center p-8">
								<h1 className="text-2xl font-bold text-destructive mb-2">Error</h1>
								<p className="text-muted-foreground">
									{error instanceof Error ? error.message : String(error)}
								</p>
							</div>
						)}
					/>
				</div>
			</StackProvider>
		</QueryClientProvider>
	)
}
