"use client";

interface RouteListProps {
	routes: string[];
}

const ROUTE_ICONS: Record<string, string> = {
	"/pages/blog": "📝",
	"/pages/chat": "💬",
	"/pages/cms": "📁",
	"/pages/forms": "📋",
	"/pages/kanban": "🗂️",
	"/pages/media": "🖼️",
	"/pages/comments": "💬",
	"/pages/route-docs": "📚",
	"/pages/ui-builder": "🎨",
	"/api/data/reference": "🔌",
};

function getIcon(route: string): string {
	for (const [prefix, icon] of Object.entries(ROUTE_ICONS)) {
		if (route.startsWith(prefix)) return icon;
	}
	if (route.startsWith("/api/")) return "🔌";
	return "📄";
}

function isApiRoute(route: string): boolean {
	return route.startsWith("/api/");
}

export function RouteList({ routes }: RouteListProps) {
	if (routes.length === 0) {
		return (
			<p className="text-sm text-zinc-500 dark:text-zinc-400 italic">
				Select plugins above to see available routes.
			</p>
		);
	}

	const pageRoutes = routes.filter((r) => !isApiRoute(r));
	const apiRoutes = routes.filter((r) => isApiRoute(r));

	return (
		<div className="space-y-4">
			{pageRoutes.length > 0 && (
				<div>
					<h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-2">
						Page Routes
					</h3>
					<ul className="space-y-1">
						{pageRoutes.map((route) => (
							<li key={route} className="flex items-center gap-2">
								<span className="text-base leading-none">{getIcon(route)}</span>
								<code className="text-sm text-zinc-700 dark:text-zinc-300 font-mono">
									{route}
								</code>
							</li>
						))}
					</ul>
				</div>
			)}
			{apiRoutes.length > 0 && (
				<div>
					<h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-2">
						API Routes
					</h3>
					<ul className="space-y-1">
						{apiRoutes.map((route) => (
							<li key={route} className="flex items-center gap-2">
								<span className="text-base leading-none">{getIcon(route)}</span>
								<code className="text-sm text-zinc-700 dark:text-zinc-300 font-mono">
									{route}
								</code>
							</li>
						))}
					</ul>
				</div>
			)}
		</div>
	);
}
