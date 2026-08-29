"use client";

import { Button } from "@workspace/ui/components/button";
import {
	usePluginOverrides,
	usePluginSiteNavigation,
	useTranslate,
} from "@btst/stack/context";
import type { KanbanPluginOverrides } from "../../overrides";
import { KANBAN_PLUGIN_ID } from "../../constants";

export function NotFoundPage() {
	const t = useTranslate();
	const { localization } =
		usePluginOverrides<KanbanPluginOverrides>(KANBAN_PLUGIN_ID);
	const { navigate } = usePluginSiteNavigation(KANBAN_PLUGIN_ID);

	return (
		<div
			className="flex min-h-[400px] flex-col items-center justify-center text-center"
			data-testid="empty-state"
		>
			<h2 className="text-2xl font-bold mb-2">
				{localization?.pageNotFound ??
					t("kanban.common.pageNotFound", "Page Not Found")}
			</h2>
			<p className="text-muted-foreground mb-6">
				{localization?.pageNotFoundDescription ??
					t(
						"kanban.common.pageNotFoundDescription",
						"The page you're looking for doesn't exist.",
					)}
			</p>
			<Button onClick={() => navigate("kanban")}>
				{localization?.backToBoards ??
					t("kanban.common.backToBoards", "Back to Boards")}
			</Button>
		</div>
	);
}
