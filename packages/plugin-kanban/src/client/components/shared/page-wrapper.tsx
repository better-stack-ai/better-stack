"use client";

import type { ReactNode, HTMLAttributes } from "react";
import { cn } from "@workspace/ui/lib/utils";

interface PageWrapperProps extends HTMLAttributes<HTMLDivElement> {
	children: ReactNode;
}

export function PageWrapper({
	children,
	className,
	...props
}: PageWrapperProps) {
	return (
		<div className={cn("container mx-auto py-8 px-4", className)} {...props}>
			{children}
		</div>
	);
}
