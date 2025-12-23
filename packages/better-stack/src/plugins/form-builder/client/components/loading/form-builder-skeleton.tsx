"use client";

import { Skeleton } from "@workspace/ui/components/skeleton";

export function FormBuilderSkeleton() {
	return (
		<div className="flex h-full flex-col" data-testid="form-builder-skeleton">
			{/* Header */}
			<div className="flex items-center gap-4 border-b p-4">
				<Skeleton className="h-10 w-48" />
				<Skeleton className="h-10 w-32" />
				<div className="ml-auto">
					<Skeleton className="h-10 w-24" />
				</div>
			</div>

			{/* Main content */}
			<div className="flex flex-1">
				{/* Palette */}
				<div className="w-64 border-r p-4 space-y-4">
					<Skeleton className="h-6 w-24" />
					{Array.from({ length: 8 }).map((_, i) => (
						<Skeleton key={i} className="h-12 rounded-lg" />
					))}
				</div>

				{/* Canvas */}
				<div className="flex-1 p-4 space-y-4">
					<Skeleton className="h-6 w-32" />
					<Skeleton className="h-48 rounded-lg" />
					<Skeleton className="h-24 rounded-lg" />
				</div>

				{/* Preview panel */}
				<div className="w-80 border-l p-4 space-y-4">
					<Skeleton className="h-6 w-20" />
					<Skeleton className="h-full rounded-lg" />
				</div>
			</div>
		</div>
	);
}
