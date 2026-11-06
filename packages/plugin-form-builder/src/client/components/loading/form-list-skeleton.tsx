"use client";

import { Skeleton } from "@workspace/ui/components/skeleton";
import { PageWrapper } from "../shared/page-wrapper";

export function FormListSkeleton() {
	return (
		<PageWrapper testId="form-list-skeleton">
			<div className="w-full max-w-5xl space-y-6">
				<div className="flex items-center justify-between">
					<div className="space-y-2">
						<Skeleton className="h-8 w-32" />
						<Skeleton className="h-4 w-48" />
					</div>
					<Skeleton className="h-10 w-28" />
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
