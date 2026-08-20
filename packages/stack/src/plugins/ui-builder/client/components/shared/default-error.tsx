"use client";

import { AlertCircle } from "lucide-react";
import { Button } from "@workspace/ui/components/button";
import { usePluginOverrides, useTranslate } from "@btst/stack/context";
import type { UIBuilderPluginOverrides } from "../../overrides";
import { uiBuilderLocalization } from "../../localization";

interface DefaultErrorProps {
	error: unknown;
	resetErrorBoundary?: () => void;
}

export function DefaultError({ error, resetErrorBoundary }: DefaultErrorProps) {
	const t = useTranslate();
	const { localization } =
		usePluginOverrides<UIBuilderPluginOverrides>("ui-builder");
	const title =
		localization?.common?.errorTitle ??
		t("uiBuilder.common.errorTitle", uiBuilderLocalization.common.errorTitle);
	const unexpectedError =
		localization?.common?.unexpectedError ??
		t(
			"uiBuilder.common.unexpectedError",
			uiBuilderLocalization.common.unexpectedError,
		);
	const tryAgain =
		localization?.common?.tryAgain ??
		t("uiBuilder.common.tryAgain", uiBuilderLocalization.common.tryAgain);

	return (
		<div className="flex flex-col items-center justify-center py-12 px-4 text-center">
			<div className="rounded-full bg-destructive/10 p-4 mb-4">
				<AlertCircle className="h-8 w-8 text-destructive" />
			</div>
			<h3 className="text-lg font-medium text-foreground mb-2">{title}</h3>
			<p className="text-sm text-muted-foreground mb-4 max-w-sm">
				{(error instanceof Error ? error.message : undefined) ||
					unexpectedError}
			</p>
			{resetErrorBoundary && (
				<Button variant="outline" onClick={resetErrorBoundary}>
					{tryAgain}
				</Button>
			)}
		</div>
	);
}
