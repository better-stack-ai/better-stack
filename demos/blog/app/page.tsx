import Link from "next/link";
import { getOrCreateQueryClient } from "@/lib/query-client";
import { getStackClient } from "@/lib/stack-client";
import { generateSchema } from "@btst/stack/plugins/route-docs/client";
import { myStack } from "@/lib/stack";

type RouteItem = { label: string; path: string };
type RouteGroup = { heading: string; routes: RouteItem[] };

const SITE_BASE_PATH = "/pages";

function routeKeyToLabel(key: string): string {
	return key
		.replace(/([A-Z])/g, " $1")
		.replace(/^./, (s) => s.toUpperCase())
		.trim();
}

export default async function Home() {
	const queryClient = getOrCreateQueryClient();
	getStackClient(queryClient);
	const schema = await generateSchema();

	const blogPlugin = schema.plugins.find((p) => p.key === "blog");
	const staticBlogRoutes: RouteItem[] =
		blogPlugin?.routes
			.filter((r) => r.pathParams.length === 0)
			.map((r) => ({
				label: routeKeyToLabel(r.key),
				path: `${SITE_BASE_PATH}${r.path}`,
			})) ?? [];

	const { items: posts } = await myStack.api.blog.getAllPosts({
		published: true,
	});

	const groups: RouteGroup[] = [
		{ heading: "Blog", routes: staticBlogRoutes },
		{
			heading: "Posts (seeded)",
			routes: posts.map((p) => ({
				label: p.title,
				path: `${SITE_BASE_PATH}/blog/${p.slug}`,
			})),
		},
		{
			heading: "Edit Posts (seeded)",
			routes: posts.map((p) => ({
				label: p.title,
				path: `${SITE_BASE_PATH}/blog/${p.slug}/edit`,
			})),
		},
		{
			heading: "Docs",
			routes: [
				{ label: "Route Docs", path: `${SITE_BASE_PATH}/route-docs` },
				{ label: "API Reference", path: "/api/data/reference" },
			],
		},
	].filter((g) => g.routes.length > 0);

	return (
		<main className="min-h-screen flex items-center justify-center bg-background p-8">
			<div className="w-full max-w-lg space-y-8">
				<div className="space-y-1">
					<h1 className="text-2xl font-semibold tracking-tight">
						BTST Blog Demo
					</h1>
					<p className="text-sm text-muted-foreground">
						Available routes in this demo
					</p>
				</div>
				<div className="space-y-6">
					{groups.map((group) => (
						<div key={group.heading} className="space-y-1">
							<p className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-1 pb-1">
								{group.heading}
							</p>
							<ul className="space-y-1">
								{group.routes.map(({ label, path }) => (
									<li key={path}>
										<Link
											href={path}
											className="flex items-center justify-between rounded-lg border px-4 py-3 text-sm hover:bg-accent hover:text-accent-foreground transition-colors group"
										>
											<div className="font-medium truncate mr-4">{label}</div>
											<code className="text-xs text-muted-foreground font-mono shrink-0 group-hover:text-accent-foreground/70">
												{path}
											</code>
										</Link>
									</li>
								))}
							</ul>
						</div>
					))}
				</div>
			</div>
		</main>
	);
}
