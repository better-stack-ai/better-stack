"use client";

import { Button } from "@workspace/ui/components/button";
import {
	usePluginOverrides,
	usePluginSiteNavigation,
	useTranslate,
} from "@btst/stack/context";
import type { FormBuilderPluginOverrides } from "../../overrides";
import { FORM_BUILDER_PLUGIN_ID } from "../../constants";

export function NotFoundPage() {
	const t = useTranslate();
	const { localization } = usePluginOverrides<FormBuilderPluginOverrides>(
		FORM_BUILDER_PLUGIN_ID,
	);
	const { Link: LinkComponent, resolve } = usePluginSiteNavigation(
		FORM_BUILDER_PLUGIN_ID,
	);

	return (
		<div className="flex flex-col items-center justify-center py-12 px-4 text-center">
			<h1 className="text-6xl font-bold text-muted-foreground mb-4">404</h1>
			<h2 className="text-xl font-medium text-foreground mb-2">
				{localization?.FORM_BUILDER_404_TITLE ??
					t("formBuilder.common.404Title", "Page not found")}
			</h2>
			<p className="text-sm text-muted-foreground mb-6 max-w-sm">
				{localization?.FORM_BUILDER_404_DESCRIPTION ??
					t(
						"formBuilder.common.404Description",
						"The page you're looking for doesn't exist or has been moved.",
					)}
			</p>
			<Button asChild>
				<LinkComponent href={resolve("forms").href}>
					{localization?.FORM_BUILDER_404_BACK ??
						t("formBuilder.common.404Back", "Back to Forms")}
				</LinkComponent>
			</Button>
		</div>
	);
}
