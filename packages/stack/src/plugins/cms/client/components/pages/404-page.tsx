"use client";

import { Button } from "@workspace/ui/components/button";
import {
	usePluginOverrides,
	useBasePath,
	useStack,
	useTranslate,
} from "@btst/stack/context";
import type { CMSPluginOverrides } from "../../overrides";

export function NotFoundPage() {
	const t = useTranslate();
	const { localization } = usePluginOverrides<CMSPluginOverrides>("cms");
	const { router } = useStack();
	const basePath = useBasePath();

	const LinkComponent = router?.Link ?? "a";

	return (
		<div className="flex flex-col items-center justify-center py-12 px-4 text-center">
			<h1 className="text-6xl font-bold text-muted-foreground mb-4">404</h1>
			<h2 className="text-xl font-medium text-foreground mb-2">
				{localization?.CMS_404_TITLE ??
					t("cms.common.404Title", "Page not found")}
			</h2>
			<p className="text-sm text-muted-foreground mb-6 max-w-sm">
				{localization?.CMS_404_DESCRIPTION ??
					t(
						"cms.common.404Description",
						"The page you're looking for doesn't exist or has been moved.",
					)}
			</p>
			<Button asChild>
				<LinkComponent href={`${basePath}/cms`}>
					{localization?.CMS_404_BACK ?? t("cms.common.404Back", "Back to CMS")}
				</LinkComponent>
			</Button>
		</div>
	);
}
