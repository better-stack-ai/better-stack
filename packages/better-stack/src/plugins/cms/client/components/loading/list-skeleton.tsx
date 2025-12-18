"use client";

import { Skeleton } from "@workspace/ui/components/skeleton";
import { PageWrapper } from "../shared/page-wrapper";

export function ListSkeleton() {
	return (
		<PageWrapper testId="cms-list-skeleton">
			<div className="w-full max-w-5xl space-y-6">
				<div className="flex items-center justify-between">
					<div className="space-y-2">
						<Skeleton className="h-8 w-48" />
						<Skeleton className="h-4 w-32" />
					</div>
					<Skeleton className="h-10 w-28" />
				</div>
				<div className="border rounded-lg">
					<div className="border-b px-4 py-3">
						<div className="flex gap-4">
							<Skeleton className="h-4 w-24" />
							<Skeleton className="h-4 w-24" />
							<Skeleton className="h-4 w-24" />
						</div>
					</div>
					{Array.from({ length: 5 }).map((_, i) => (
						<div key={i} className="px-4 py-3 border-b last:border-b-0">
							<div className="flex gap-4">
								<Skeleton className="h-4 w-32" />
								<Skeleton className="h-4 w-24" />
								<Skeleton className="h-4 w-24" />
							</div>
						</div>
					))}
				</div>
			</div>
		</PageWrapper>
	);
}
