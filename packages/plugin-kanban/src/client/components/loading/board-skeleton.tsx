"use client";

import { Skeleton } from "@workspace/ui/components/skeleton";

export function BoardSkeleton() {
	return (
		<div className="container mx-auto py-8 px-4">
			<div className="w-full flex items-center justify-between mb-8">
				<div className="flex items-center gap-4">
					<Skeleton className="h-5 w-5" />
					<div>
						<Skeleton className="h-9 w-48" />
						<Skeleton className="h-5 w-64 mt-2" />
					</div>
				</div>
				<Skeleton className="h-10 w-28" />
			</div>
			<div className="grid gap-4 md:grid-cols-3">
				{Array.from({ length: 3 }).map((_, colIdx) => (
					<div
						key={colIdx}
						className="rounded-lg border bg-zinc-100 dark:bg-zinc-900 p-2.5"
					>
						<div className="flex items-center gap-2 mb-4">
							<Skeleton className="h-8 w-8" />
							<Skeleton className="h-6 w-24" />
							<Skeleton className="h-5 w-8" />
						</div>
						<div className="space-y-2">
							{Array.from({ length: 3 }).map((_, taskIdx) => (
								<div key={taskIdx} className="rounded-md border bg-card p-3">
									<div className="flex items-center gap-2 mb-2">
										<Skeleton className="h-6 w-6" />
										<Skeleton className="h-5 flex-1" />
										<Skeleton className="h-5 w-16" />
									</div>
									<div className="flex items-center justify-between">
										<Skeleton className="h-4 w-20" />
										<Skeleton className="h-4 w-16" />
									</div>
								</div>
							))}
						</div>
					</div>
				))}
			</div>
		</div>
	);
}
