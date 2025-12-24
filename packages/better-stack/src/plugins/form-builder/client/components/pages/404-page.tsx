"use client";

import { Button } from "@workspace/ui/components/button";
import { usePluginOverrides, useBasePath } from "@btst/stack/context";
import type { FormBuilderPluginOverrides } from "../../overrides";

export function NotFoundPage() {
	const { navigate, Link } =
		usePluginOverrides<FormBuilderPluginOverrides>("form-builder");
	const basePath = useBasePath();

	const LinkComponent = Link || "a";

	return (
		<div className="flex flex-col items-center justify-center py-12 px-4 text-center">
			<h1 className="text-6xl font-bold text-muted-foreground mb-4">404</h1>
			<h2 className="text-xl font-medium text-foreground mb-2">
				Page not found
			</h2>
			<p className="text-sm text-muted-foreground mb-6 max-w-sm">
				The page you're looking for doesn't exist or has been moved.
			</p>
			<Button asChild>
				<LinkComponent href={`${basePath}/forms`}>Back to Forms</LinkComponent>
			</Button>
		</div>
	);
}
