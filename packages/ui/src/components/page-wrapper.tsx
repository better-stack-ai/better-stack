"use client";

import { PageLayout } from "./page-layout";
import { StackAttribution } from "./stack-attribution";

export interface PageWrapperProps {
	children: React.ReactNode;
	className?: string;
	testId?: string;
	/**
	 * Whether to show the "Powered by BTST" attribution.
	 * Defaults to true.
	 */
	showAttribution?: boolean;
}

/**
 * Shared page wrapper component providing consistent layout and optional attribution
 * for plugin pages. Used by blog, CMS, and other plugins.
 *
 * @example
 * ```tsx
 * <PageWrapper testId="my-page" showAttribution={false}>
 *   <div className="w-full max-w-5xl">
 *     <h1>My Page</h1>
 *   </div>
 * </PageWrapper>
 * ```
 */
export function PageWrapper({
	children,
	className,
	testId,
	showAttribution = true,
}: PageWrapperProps) {
	return (
		<>
			<PageLayout className={className} data-testid={testId}>
				{children}
			</PageLayout>

			{showAttribution && <StackAttribution />}
		</>
	);
}
