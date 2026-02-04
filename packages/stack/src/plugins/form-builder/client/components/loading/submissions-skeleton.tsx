"use client";

import { Skeleton } from "@workspace/ui/components/skeleton";
import { PageWrapper } from "../shared/page-wrapper";

export function SubmissionsSkeleton() {
	return (
		<PageWrapper testId="submissions-skeleton">
			<div className="w-full max-w-5xl space-y-6">
				<div className="flex items-center justify-between">
					<div className="space-y-2">
						<Skeleton className="h-8 w-48" />
						<Skeleton className="h-4 w-64" />
					</div>
					<Skeleton className="h-10 w-32" />
				</div>
				<div className="rounded-lg border">
					<div className="border-b p-4">
						<div className="flex gap-4">
							<Skeleton className="h-4 w-24" />
							<Skeleton className="h-4 w-48" />
							<Skeleton className="h-4 w-32" />
							<Skeleton className="h-4 w-20" />
						</div>
					</div>
					{Array.from({ length: 5 }).map((_, i) => (
						<div key={i} className="border-b p-4 last:border-0">
							<div className="flex gap-4">
								<Skeleton className="h-4 w-24" />
								<Skeleton className="h-4 w-48" />
								<Skeleton className="h-4 w-32" />
								<Skeleton className="h-4 w-20" />
							</div>
						</div>
					))}
				</div>
			</div>
		</PageWrapper>
	);
}
