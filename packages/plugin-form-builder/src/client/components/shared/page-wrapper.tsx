"use client";

import { usePluginOverrides } from "@btst/stack/context";
import { PageWrapper as SharedPageWrapper } from "@workspace/ui/components/page-wrapper";
import type { FormBuilderPluginOverrides } from "../../overrides";
import { FORM_BUILDER_PLUGIN_ID } from "../../constants";
import { cn } from "../../../utils";

export function PageWrapper({
	children,
	className,
	testId,
}: {
	children: React.ReactNode;
	className?: string;
	testId?: string;
}) {
	const { showAttribution, classNames } = usePluginOverrides<
		FormBuilderPluginOverrides,
		Partial<FormBuilderPluginOverrides>
	>(FORM_BUILDER_PLUGIN_ID, {
		showAttribution: true,
	});

	return (
		<SharedPageWrapper
			className={cn(className, classNames?.container)}
			testId={testId}
			showAttribution={showAttribution}
		>
			{children}
		</SharedPageWrapper>
	);
}
