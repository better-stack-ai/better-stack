"use client";

import { Skeleton } from "@workspace/ui/components/skeleton";

/**
 * Skeleton loading state for the chat page
 */
export function ChatPageSkeleton() {
	return (
		<div className="flex h-[calc(100vh-4rem)] w-full overflow-hidden">
			{/* Sidebar skeleton */}
			<div className="hidden md:flex w-72 flex-col border-r bg-muted/30">
				<div className="p-4 border-b">
					<Skeleton className="h-10 w-full" />
				</div>
				<div className="flex-1 p-2 space-y-2">
					{Array.from({ length: 5 }).map((_, i) => (
						<div key={i} className="flex items-center gap-2 p-3">
							<Skeleton className="h-4 w-4 shrink-0" />
							<div className="flex-1 space-y-1.5">
								<Skeleton className="h-4 w-full" />
								<Skeleton className="h-3 w-20" />
							</div>
						</div>
					))}
				</div>
			</div>

			{/* Main chat area skeleton */}
			<div className="flex-1 flex flex-col min-w-0">
				{/* Header */}
				<div className="flex items-center gap-2 p-2 border-b">
					<Skeleton className="h-9 w-9 md:hidden" />
					<Skeleton className="h-9 w-9 hidden md:block" />
					<div className="flex-1" />
				</div>

				{/* Messages area */}
				<div className="flex-1 p-4 space-y-4">
					<div className="max-w-3xl mx-auto w-full space-y-4">
						{/* Empty state placeholder */}
						<div className="flex flex-col items-center justify-center h-full min-h-[300px]">
							<Skeleton className="h-4 w-48" />
						</div>
					</div>
				</div>

				{/* Input area */}
				<div className="border-t p-4">
					<div className="max-w-3xl mx-auto">
						<Skeleton className="h-12 w-full rounded-lg" />
					</div>
				</div>
			</div>
		</div>
	);
}
