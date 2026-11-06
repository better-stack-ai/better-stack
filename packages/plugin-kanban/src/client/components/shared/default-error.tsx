"use client";

import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@workspace/ui/components/button";
import { usePluginOverrides, useTranslate } from "@btst/stack/context";
import type { KanbanPluginOverrides } from "../../overrides";
import { KANBAN_PLUGIN_ID } from "../../constants";

interface DefaultErrorProps {
	error?: unknown;
	reset?: () => void;
}

export function DefaultError({ error, reset }: DefaultErrorProps) {
	const t = useTranslate();
	const { localization } =
		usePluginOverrides<KanbanPluginOverrides>(KANBAN_PLUGIN_ID);
	return (
		<div
			className="flex flex-col items-center justify-center py-12 text-center"
			data-testid="error-placeholder"
		>
			<div className="rounded-full bg-destructive/10 p-6 mb-4">
				<AlertCircle className="h-8 w-8 text-destructive" />
			</div>
			<h3 className="text-lg font-semibold mb-2">
				{localization?.errorGeneric ??
					t("kanban.common.errorGeneric", "Something went wrong")}
			</h3>
			<p className="text-muted-foreground max-w-md mb-4">
				{(error instanceof Error ? error.message : undefined) ||
					(localization?.unexpectedError ??
						t(
							"kanban.common.unexpectedError",
							"An unexpected error occurred. Please try again.",
						))}
			</p>
			{reset && (
				<Button onClick={reset} variant="outline">
					<RefreshCw className="mr-2 h-4 w-4" />
					{localization?.tryAgain ?? t("kanban.common.tryAgain", "Try Again")}
				</Button>
			)}
		</div>
	);
}
