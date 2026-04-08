"use client";

import { Button } from "@/components/ui/button";

interface RouteListProps {
	routes: string[];
	onPageRouteClick?: (route: string) => void;
	activePageRoute?: string | null;
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

export function RouteList({
	routes,
	onPageRouteClick,
	activePageRoute,
}: RouteListProps) {
	if (routes.length === 0) {
		return (
			<p className="text-sm text-muted-foreground italic">
				Select plugins above to see available routes.
			</p>
		);
	}

	const pageRoutes = routes.filter((r) => !isApiRoute(r));
	const apiRoutes = routes.filter((r) => isApiRoute(r));

	return (
		<div className="flex flex-col gap-4">
			{pageRoutes.length > 0 && (
				<div>
					<h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
						Page Routes
					</h3>
					<ul className="flex flex-col gap-1">
						{pageRoutes.map((route) => (
							<li key={route} className="flex items-center gap-2">
								<span className="text-base leading-none">{getIcon(route)}</span>
								{onPageRouteClick ? (
									<Button
										variant="link"
										className="h-auto p-0 font-mono text-sm"
										onClick={() => onPageRouteClick(route)}
										aria-current={
											activePageRoute === route ? "page" : undefined
										}
									>
										{route}
									</Button>
								) : (
									<code className="text-sm text-foreground font-mono">
										{route}
									</code>
								)}
							</li>
						))}
					</ul>
				</div>
			)}
			{apiRoutes.length > 0 && (
				<div>
					<h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
						API Routes
					</h3>
					<ul className="flex flex-col gap-1">
						{apiRoutes.map((route) => (
							<li key={route} className="flex items-center gap-2">
								<span className="text-base leading-none">{getIcon(route)}</span>
								<code className="text-sm text-foreground font-mono">
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
