import Link from "next/link";
import { myStack } from "@/lib/stack";
import { UI_BUILDER_TYPE_SLUG } from "@btst/stack/plugins/ui-builder";
import { ArrowLeft, FileText, ExternalLink } from "lucide-react";

export default async function PublicPagesListPage() {
	const { items } = await myStack.api.cms.getAllContentItems(
		UI_BUILDER_TYPE_SLUG,
		{ limit: 100 },
	);

	const publishedPages = items.filter(
		(item) =>
			typeof item.data === "object" &&
			item.data !== null &&
			(item.data as Record<string, unknown>).status === "published",
	);

	return (
		<div className="min-h-screen bg-background">
			<nav className="border-b bg-background sticky top-0 z-50">
				<div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
					<Link
						href="/"
						className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
					>
						<ArrowLeft className="h-4 w-4" />
						Back to demo
					</Link>
					<span className="text-sm font-medium">BTST UI Builder Demo</span>
				</div>
			</nav>

			<main className="max-w-3xl mx-auto px-4 py-10">
				<div className="mb-8 space-y-1">
					<h1 className="text-2xl font-semibold tracking-tight">
						Published Pages
					</h1>
					<p className="text-sm text-muted-foreground">
						Pages built with the UI Builder and published for public viewing
					</p>
				</div>

				{publishedPages.length === 0 ? (
					<div className="flex flex-col items-center justify-center py-16 gap-4 text-center border rounded-lg bg-muted/30">
						<FileText className="h-10 w-10 text-muted-foreground/50" />
						<div>
							<p className="font-medium text-sm">No published pages yet</p>
							<p className="text-sm text-muted-foreground mt-1">
								Build and publish pages in the{" "}
								<Link
									href="/pages/ui-builder"
									className="text-primary hover:underline"
								>
									UI Builder
								</Link>
								.
							</p>
						</div>
					</div>
				) : (
					<ul className="space-y-2">
						{publishedPages.map((page) => (
							<li key={page.id}>
								<Link
									href={`/view/${page.slug}`}
									className="flex items-center justify-between rounded-lg border px-4 py-3 text-sm hover:bg-accent hover:text-accent-foreground transition-colors group"
								>
									<div className="flex items-center gap-3">
										<FileText className="h-4 w-4 text-muted-foreground group-hover:text-accent-foreground/70 shrink-0" />
										<span className="font-medium">{page.slug}</span>
									</div>
									<div className="flex items-center gap-2">
										<code className="text-xs text-muted-foreground font-mono group-hover:text-accent-foreground/70">
											/view/{page.slug}
										</code>
										<ExternalLink className="h-3.5 w-3.5 text-muted-foreground/50 group-hover:text-accent-foreground/50" />
									</div>
								</Link>
							</li>
						))}
					</ul>
				)}

				<div className="mt-8 pt-6 border-t">
					<Link
						href="/pages/ui-builder"
						className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
					>
						Open the UI Builder to create more pages →
					</Link>
				</div>
			</main>
		</div>
	);
}
