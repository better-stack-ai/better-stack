import { Skeleton } from "@workspace/ui/components/skeleton";
import { PostCardSkeleton } from "./post-card-skeleton";

export function RecentPostsCarouselSkeleton() {
	return (
		<div className="w-full mt-4 py-4 border-t">
			<div className="flex items-center justify-between mb-4">
				<Skeleton className="h-7 w-36" />
				<Skeleton className="h-4 w-16" />
			</div>
			<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
				{[1, 2, 3].map((i) => (
					<PostCardSkeleton key={i} />
				))}
			</div>
		</div>
	);
}
