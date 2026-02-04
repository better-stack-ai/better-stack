"use client";

import type { ReactNode } from "react";
import { cn } from "@workspace/ui/lib/utils";

interface EmptyStateProps {
	title: string;
	description?: string;
	action?: ReactNode;
	icon?: ReactNode;
	className?: string;
}

export function EmptyState({
	title,
	description,
	action,
	icon,
	className,
}: EmptyStateProps) {
	return (
		<div
			className={cn(
				"flex flex-col items-center justify-center py-12 text-center",
				className,
			)}
			data-testid="empty-state"
		>
			{icon && <div className="rounded-full bg-muted p-6 mb-4">{icon}</div>}
			<h3 className="text-lg font-semibold mb-2">{title}</h3>
			{description && (
				<p className="text-muted-foreground max-w-md mb-4">{description}</p>
			)}
			{action && <div>{action}</div>}
		</div>
	);
}
