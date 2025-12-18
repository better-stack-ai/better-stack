"use client";

import { cn } from "@workspace/ui/lib/utils";

export interface PageLayoutProps {
	children: React.ReactNode;
	className?: string;
	"data-testid"?: string;
}

/**
 * Shared page layout component providing consistent container styling
 * for plugin pages. Used by blog, CMS, and other plugins.
 */
export function PageLayout({
	children,
	className,
	"data-testid": dataTestId,
}: PageLayoutProps) {
	return (
		<div
			className={cn(
				"container mx-auto flex min-h-dvh flex-col items-center gap-12 px-4 py-18 lg:px-16",
				className,
			)}
			data-testid={dataTestId}
		>
			{children}
		</div>
	);
}
