"use client";

import { Skeleton } from "@workspace/ui/components/skeleton";

export function PageBuilderSkeleton() {
	return (
		<div className="flex h-full flex-col" data-testid="page-builder-skeleton">
			{/* Header */}
			<div className="flex items-center gap-4 border-b p-4">
				<Skeleton className="h-10 w-10" />
				<Skeleton className="h-10 w-48" />
				<Skeleton className="h-10 w-32" />
				<div className="ml-auto">
					<Skeleton className="h-10 w-24" />
				</div>
			</div>

			{/* Main content - UI Builder layout */}
			<div className="flex flex-1">
				{/* Left panel - Component palette */}
				<div className="w-64 border-r p-4 space-y-4">
					<Skeleton className="h-6 w-24" />
					{Array.from({ length: 6 }).map((_, i) => (
						<Skeleton key={i} className="h-12 rounded-lg" />
					))}
				</div>

				{/* Center - Canvas */}
				<div className="flex-1 p-4 space-y-4">
					<Skeleton className="h-6 w-32" />
					<Skeleton className="h-64 rounded-lg" />
					<Skeleton className="h-32 rounded-lg" />
				</div>

				{/* Right panel - Properties */}
				<div className="w-80 border-l p-4 space-y-4">
					<Skeleton className="h-6 w-20" />
					<Skeleton className="h-10 w-full" />
					<Skeleton className="h-10 w-full" />
					<Skeleton className="h-10 w-full" />
					<Skeleton className="h-24 w-full" />
				</div>
			</div>
		</div>
	);
}
