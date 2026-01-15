"use client";

import { Inbox } from "lucide-react";

interface EmptyStateProps {
	title: string;
	description?: string;
	action?: React.ReactNode;
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
	return (
		<div className="flex flex-col items-center justify-center py-12 px-4 text-center">
			<div className="rounded-full bg-muted p-4 mb-4">
				<Inbox className="h-8 w-8 text-muted-foreground" />
			</div>
			<h3 className="text-lg font-medium text-foreground mb-2">{title}</h3>
			{description && (
				<p className="text-sm text-muted-foreground mb-4 max-w-sm">
					{description}
				</p>
			)}
			{action}
		</div>
	);
}
