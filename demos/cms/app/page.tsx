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

	const cmsPlugin = schema.plugins.find((p) => p.key === "cms");
	const staticCmsRoutes: RouteItem[] =
		cmsPlugin?.routes
			.filter((r) => r.pathParams.length === 0)
			.map((r) => ({
				label: routeKeyToLabel(r.key),
				path: `${SITE_BASE_PATH}${r.path}`,
			})) ?? [];

	const [contentTypes, { items: articles }] = await Promise.all([
		myStack.api.cms.getAllContentTypes(),
		myStack.api.cms.getAllContentItems("article"),
	]);

	// Expand parameterized CMS admin routes (/cms/:typeSlug, /cms/:typeSlug/new) with real content type slugs
	const cmsTypeRoutes: RouteItem[] = contentTypes.flatMap((t) => [
		{ label: t.name, path: `${SITE_BASE_PATH}/cms/${t.slug}` },
		{ label: `New ${t.name}`, path: `${SITE_BASE_PATH}/cms/${t.slug}/new` },
	]);

	const groups: RouteGroup[] = [
		{
			heading: "Articles (public)",
			routes: [
				{ label: "Articles", path: `${SITE_BASE_PATH}/articles` },
				...articles.map((item) => ({
					label: (item.parsedData as { title?: string }).title ?? item.slug,
					path: `${SITE_BASE_PATH}/articles/${item.slug}`,
				})),
			],
		},
		{
			heading: "CMS (admin)",
			routes: [...staticCmsRoutes, ...cmsTypeRoutes],
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
						BTST CMS Demo
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
