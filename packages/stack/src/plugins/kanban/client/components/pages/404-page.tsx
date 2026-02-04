"use client";

import { Button } from "@workspace/ui/components/button";
import { usePluginOverrides } from "@btst/stack/context";
import type { KanbanPluginOverrides } from "../../overrides";

export function NotFoundPage() {
	const { navigate: overrideNavigate } =
		usePluginOverrides<KanbanPluginOverrides>("kanban");
	const navigate =
		overrideNavigate ||
		((path: string) => {
			window.location.href = path;
		});

	return (
		<div
			className="flex min-h-[400px] flex-col items-center justify-center text-center"
			data-testid="empty-state"
		>
			<h2 className="text-2xl font-bold mb-2">Page Not Found</h2>
			<p className="text-muted-foreground mb-6">
				The page you're looking for doesn't exist.
			</p>
			<Button onClick={() => navigate("/pages/kanban")}>Back to Boards</Button>
		</div>
	);
}
