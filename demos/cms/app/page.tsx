import Link from "next/link";

type RouteItem = {
	label: string;
	path: string;
	description: string;
};

type RouteGroup = {
	heading: string;
	routes: RouteItem[];
};

const groups: RouteGroup[] = [
	{
		heading: "Articles (public)",
		routes: [
			{
				label: "Articles",
				path: "/pages/articles",
				description: "Public-facing article listing",
			},
			{
				label: "Welcome to BTST CMS",
				path: "/pages/articles/welcome-to-btst-cms",
				description: "Introduction to managing structured content",
			},
			{
				label: "Getting Started with Content Types",
				path: "/pages/articles/getting-started-with-content-types",
				description: "How to define and manage content types",
			},
		],
	},
	{
		heading: "CMS (admin)",
		routes: [
			{
				label: "CMS Dashboard",
				path: "/pages/cms",
				description: "Manage content types and entries",
			},
			{
				label: "Article List",
				path: "/pages/cms/article",
				description: "All article content items",
			},
			{
				label: "New Article",
				path: "/pages/cms/article/new",
				description: "Create a new article",
			},
		],
	},
	{
		heading: "Docs",
		routes: [
			{
				label: "Route Docs",
				path: "/pages/route-docs",
				description: "All client routes in this demo",
			},
			{
				label: "API Reference",
				path: "/api/data/reference",
				description: "OpenAPI reference for the backend",
			},
		],
	},
];

export default function Home() {
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
								{group.routes.map(({ label, path, description }) => (
									<li key={path}>
										<Link
											href={path}
											className="flex items-center justify-between rounded-lg border px-4 py-3 text-sm hover:bg-accent hover:text-accent-foreground transition-colors group"
										>
											<div className="space-y-0.5 min-w-0 mr-4">
												<div className="font-medium">{label}</div>
												<div className="text-xs text-muted-foreground group-hover:text-accent-foreground/70">
													{description}
												</div>
											</div>
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
