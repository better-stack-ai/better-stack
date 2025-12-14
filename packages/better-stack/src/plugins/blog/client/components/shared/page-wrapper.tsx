"use client";

import { usePluginOverrides } from "@btst/stack/context";
import { BetterStackAttribution } from "@workspace/ui/components/better-stack-attribution";
import { PageLayout } from "./page-layout";
import type { BlogPluginOverrides } from "../../overrides";

export function PageWrapper({
	children,
	className,
	testId,
}: {
	children: React.ReactNode;
	className?: string;
	testId?: string;
}) {
	const { showAttribution } = usePluginOverrides<
		BlogPluginOverrides,
		Partial<BlogPluginOverrides>
	>("blog", {
		showAttribution: true,
	});
	return (
		<>
			<PageLayout className={className} data-testid={testId}>
				{children}
			</PageLayout>

			{showAttribution && <BetterStackAttribution />}
		</>
	);
}
