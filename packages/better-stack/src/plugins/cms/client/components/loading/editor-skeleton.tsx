"use client";

import { Skeleton } from "@workspace/ui/components/skeleton";

/**
 * Editor skeleton without wrapper - used when already inside a PageWrapper
 */
export function EditorSkeleton() {
	return (
		<div className="space-y-6">
			<div className="space-y-2">
				<Skeleton className="h-8 w-48" />
			</div>
			<div className="space-y-4">
				<div className="space-y-2">
					<Skeleton className="h-4 w-16" />
					<Skeleton className="h-10 w-full" />
				</div>
				<div className="space-y-2">
					<Skeleton className="h-4 w-24" />
					<Skeleton className="h-10 w-full" />
				</div>
				<div className="space-y-2">
					<Skeleton className="h-4 w-20" />
					<Skeleton className="h-24 w-full" />
				</div>
				<div className="space-y-2">
					<Skeleton className="h-4 w-16" />
					<Skeleton className="h-10 w-full" />
				</div>
			</div>
			<Skeleton className="h-10 w-24" />
		</div>
	);
}
