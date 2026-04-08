import { useState } from "react"
import { Link, useNavigate, useParams } from "react-router"
import { QueryClientProvider } from "@tanstack/react-query"
import { StackProvider } from "@btst/stack/context"
import { FormRenderer } from "@btst/stack/plugins/form-builder/client/components"
import type { FormBuilderPluginOverrides } from "@btst/stack/plugins/form-builder/client"
import { getOrCreateQueryClient } from "~/lib/query-client"
import { Loader2, AlertCircle } from "lucide-react"

const getBaseURL = () =>
	typeof window !== "undefined"
		? window.location.origin
		: process.env.PUBLIC_SITE_URL || process.env.BASE_URL || "http://localhost:5173"

type PluginOverrides = {
	"form-builder": FormBuilderPluginOverrides
}

/**
 * Public form demo page — renders any published form by slug.
 * Access at: /form-demo/<form-slug>
 *
 * Wire this route in app/routes.ts:
 *   route("form-demo/:slug", "routes/form-demo.tsx"),
 */
export default function FormDemoPage() {
	const { slug } = useParams()
	const navigate = useNavigate()
	const [queryClient] = useState(() => getOrCreateQueryClient())
	const baseURL = getBaseURL()

	return (
		<QueryClientProvider client={queryClient}>
			<StackProvider<PluginOverrides>
				basePath=""
				overrides={
				{
					"form-builder": {
						apiBaseURL: baseURL,
						apiBasePath: "/api/data",
						navigate: (path) => navigate(path),
						refresh: () => window.location.reload(),
						Link: ({ href, to, ...props }) => (
							<Link to={href || to || "#"} {...props} />
						),
					},
				}
				}
			>
				<main className="container mx-auto px-4 py-8">
					<div className="max-w-2xl mx-auto">
						<div className="bg-card rounded-lg border p-6 shadow-sm">
							<FormRenderer
								slug={slug ?? ""}
								onSuccess={(submission) => {
									console.log("Form submitted:", submission)
								}}
								onError={(error) => {
									console.error("Form error:", error)
								}}
								LoadingComponent={FormLoadingState}
								ErrorComponent={FormErrorState}
								className="space-y-6"
							/>
						</div>
					</div>
				</main>
			</StackProvider>
		</QueryClientProvider>
	)
}

function FormLoadingState() {
	return (
		<div className="flex flex-col items-center justify-center py-12 gap-4">
			<Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
			<p className="text-muted-foreground">Loading form...</p>
		</div>
	)
}

function FormErrorState({ error }: { error: Error }) {
	return (
		<div className="flex flex-col items-center justify-center py-12 gap-4 text-center">
			<AlertCircle className="h-12 w-12 text-destructive" />
			<div>
				<h3 className="font-semibold text-lg">Form not found</h3>
				<p className="text-muted-foreground">
					{error.message || "The form you're looking for doesn't exist or is no longer available."}
				</p>
			</div>
		</div>
	)
}
