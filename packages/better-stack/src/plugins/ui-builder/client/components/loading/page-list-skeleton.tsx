"use client";

import { Skeleton } from "@workspace/ui/components/skeleton";
import { PageWrapper } from "../shared/page-wrapper";

export function PageListSkeleton() {
	return (
		<PageWrapper testId="page-list-skeleton">
			<div className="w-full max-w-5xl space-y-6">
				<div className="flex items-center justify-between">
					<div className="space-y-2">
						<Skeleton className="h-8 w-48" />
						<Skeleton className="h-4 w-64" />
					</div>
					<Skeleton className="h-10 w-32" />
				</div>
				<div className="space-y-4">
					{Array.from({ length: 5 }).map((_, i) => (
						<Skeleton key={i} className="h-16 rounded-lg" />
					))}
				</div>
			</div>
		</PageWrapper>
	);
}
