"use client";

import { Skeleton } from "@workspace/ui/components/skeleton";
import { ScrollArea } from "@workspace/ui/components/scroll-area";
import { Card, CardContent } from "@workspace/ui/components/card";

export function DocsPageSkeleton() {
	return (
		<div className="flex min-h-screen bg-background">
			{/* Desktop Sidebar skeleton */}
			<aside className="hidden md:block w-72 border-r bg-card shrink-0">
				<div className="p-4 border-b">
					<Skeleton className="h-4 w-16" />
				</div>
				<ScrollArea className="h-[calc(100vh-57px)]">
					<div className="p-3 space-y-4">
						{/* Plugin groups */}
						{[1, 2, 3].map((i) => (
							<div key={i} className="space-y-2">
								<Skeleton className="h-8 w-full" />
								<div className="ml-2 space-y-1">
									{[1, 2, 3].map((j) => (
										<Skeleton key={j} className="h-7 w-full" />
									))}
								</div>
							</div>
						))}
					</div>
				</ScrollArea>
			</aside>

			{/* Mobile header skeleton */}
			<div className="md:hidden fixed top-0 left-0 right-0 z-40 bg-card border-b">
				<div className="flex items-center justify-between p-4">
					<Skeleton className="h-4 w-24" />
					<Skeleton className="h-8 w-20" />
				</div>
			</div>

			{/* Main content skeleton */}
			<main className="flex-1 overflow-auto pt-16 md:pt-0">
				<div className="max-w-4xl mx-auto p-4 sm:p-6 lg:p-8 space-y-4 sm:space-y-6">
					{/* Title */}
					<div className="space-y-2">
						<Skeleton className="h-8 sm:h-9 w-48 sm:w-64" />
						<Skeleton className="h-4 sm:h-5 w-72 sm:w-96" />
					</div>

					{/* Separator */}
					<div className="h-px bg-border" />

					{/* Badges */}
					<div className="flex gap-2">
						<Skeleton className="h-6 w-24" />
						<Skeleton className="h-6 w-20" />
					</div>

					{/* Routes card */}
					<Card>
						<div className="p-4 sm:p-6">
							<Skeleton className="h-6 w-32 mb-4" />
						</div>
						<CardContent className="pt-0 space-y-4">
							{/* Desktop table skeleton */}
							<div className="hidden md:block space-y-2">
								{[1, 2, 3, 4].map((i) => (
									<Skeleton key={i} className="h-12 w-full" />
								))}
							</div>
							{/* Mobile cards skeleton */}
							<div className="md:hidden space-y-3">
								{[1, 2, 3].map((i) => (
									<Skeleton key={i} className="h-28 w-full rounded-lg" />
								))}
							</div>
						</CardContent>
					</Card>
				</div>
			</main>
		</div>
	);
}
