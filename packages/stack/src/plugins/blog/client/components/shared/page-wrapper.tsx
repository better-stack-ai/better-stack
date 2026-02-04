"use client";

import { usePluginOverrides } from "@btst/stack/context";
import { PageWrapper as SharedPageWrapper } from "@workspace/ui/components/page-wrapper";
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
		<SharedPageWrapper
			className={className}
			testId={testId}
			showAttribution={showAttribution}
		>
			{children}
		</SharedPageWrapper>
	);
}
