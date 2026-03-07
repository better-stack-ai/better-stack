import Link from "next/link";
import { getOrCreateQueryClient } from "@/lib/query-client";
import { getStackClient } from "@/lib/stack-client";
import { generateSchema } from "@btst/stack/plugins/route-docs/client";
import { myStack } from "@/lib/stack";
import { UI_BUILDER_TYPE_SLUG } from "@btst/stack/plugins/ui-builder";

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

	const uiBuilderPlugin = schema.plugins.find((p) => p.key === "uiBuilder");
	const staticUiBuilderRoutes: RouteItem[] =
		uiBuilderPlugin?.routes
			.filter((r) => r.pathParams.length === 0)
			.map((r) => ({
				label: routeKeyToLabel(r.key),
				path: `${SITE_BASE_PATH}${r.path}`,
			})) ?? [];

	const cmsPlugin = schema.plugins.find((p) => p.key === "cms");
	const staticCmsRoutes: RouteItem[] =
		cmsPlugin?.routes
			.filter((r) => r.pathParams.length === 0)
			.map((r) => ({
				label: routeKeyToLabel(r.key),
				path: `${SITE_BASE_PATH}${r.path}`,
			})) ?? [];

	// Expand parameterized CMS admin routes with real content type slugs
	const contentTypes = await myStack.api.cms.getAllContentTypes();
	const cmsTypeRoutes: RouteItem[] = contentTypes.flatMap((t) => [
		{ label: t.name, path: `${SITE_BASE_PATH}/cms/${t.slug}` },
		{ label: `New ${t.name}`, path: `${SITE_BASE_PATH}/cms/${t.slug}/new` },
	]);

	// Fetch published UI builder pages for public viewing links
	const { items: allPages } = await myStack.api.cms.getAllContentItems(
		UI_BUILDER_TYPE_SLUG,
		{ limit: 100 },
	);
	const publishedPages = allPages.filter(
		(item) =>
			typeof item.data === "object" &&
			item.data !== null &&
			(item.data as Record<string, unknown>).status === "published",
	);
	const publicPageRoutes: RouteItem[] = [
		{ label: "All Published Pages", path: "/view" },
		...publishedPages.map((p) => ({
			label: p.slug,
			path: `/view/${p.slug}`,
		})),
	];

	const groups: RouteGroup[] = [
		{ heading: "UI Builder", routes: staticUiBuilderRoutes },
		{ heading: "Public Pages", routes: publicPageRoutes },
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
						BTST UI Builder Demo
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
