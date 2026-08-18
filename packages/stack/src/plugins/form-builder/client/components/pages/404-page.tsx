"use client";

import { Button } from "@workspace/ui/components/button";
import {
	usePluginOverrides,
	useBasePath,
	useTranslate,
} from "@btst/stack/context";
import type { FormBuilderPluginOverrides } from "../../overrides";

export function NotFoundPage() {
	const t = useTranslate();
	const { Link, localization } =
		usePluginOverrides<FormBuilderPluginOverrides>("form-builder");
	const basePath = useBasePath();

	const LinkComponent = Link || "a";

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
				<LinkComponent href={`${basePath}/forms`}>
					{localization?.FORM_BUILDER_404_BACK ??
						t("formBuilder.common.404Back", "Back to Forms")}
				</LinkComponent>
			</Button>
		</div>
	);
}
