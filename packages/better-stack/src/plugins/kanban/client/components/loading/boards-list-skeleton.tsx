"use client";

import { Skeleton } from "@workspace/ui/components/skeleton";
import { Card, CardContent, CardHeader } from "@workspace/ui/components/card";

export function BoardsListSkeleton() {
	return (
		<div className="container mx-auto py-8 px-4">
			<div className="flex items-center justify-between mb-8">
				<div>
					<Skeleton className="h-9 w-48" />
					<Skeleton className="h-5 w-64 mt-2" />
				</div>
				<Skeleton className="h-10 w-32" />
			</div>
			<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
				{Array.from({ length: 6 }).map((_, i) => (
					<Card key={i}>
						<CardHeader>
							<Skeleton className="h-6 w-3/4" />
							<Skeleton className="h-4 w-full mt-2" />
						</CardHeader>
						<CardContent>
							<div className="flex items-center justify-between">
								<Skeleton className="h-4 w-20" />
								<Skeleton className="h-4 w-24" />
							</div>
						</CardContent>
					</Card>
				))}
			</div>
		</div>
	);
}
