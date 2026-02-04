"use client";

import { Skeleton } from "@workspace/ui/components/skeleton";
import { PageWrapper } from "../shared/page-wrapper";

export function DashboardSkeleton() {
	return (
		<PageWrapper testId="cms-dashboard-skeleton">
			<div className="w-full max-w-5xl space-y-6">
				<div className="space-y-2">
					<Skeleton className="h-8 w-48" />
					<Skeleton className="h-4 w-64" />
				</div>
				<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
					{Array.from({ length: 6 }).map((_, i) => (
						<Skeleton key={i} className="h-32 rounded-lg" />
					))}
				</div>
			</div>
		</PageWrapper>
	);
}
