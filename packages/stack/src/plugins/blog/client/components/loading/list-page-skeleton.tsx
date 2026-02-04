import { PageHeaderSkeleton } from "./page-header-skeleton";
import { PageLayout } from "@workspace/ui/components/page-layout";
import { PostCardSkeleton } from "./post-card-skeleton";
import { Skeleton } from "@workspace/ui/components/skeleton";

export function ListPageSkeleton() {
	return (
		<PageLayout>
			<div className="flex flex-col items-center gap-3">
				<PageHeaderSkeleton />
			</div>
			<PostsListSkeleton count={6} />
		</PageLayout>
	);
}

function PostsListSkeleton({ count = 6 }: { count?: number }) {
	return (
		<div className="w-full space-y-6">
			<div className="flex justify-center pb-6">
				<div className="flex w-full max-w-md items-center gap-2">
					<Skeleton className="h-10 grow rounded-md" />
					<Skeleton className="h-10 w-24 rounded-md" />
				</div>
			</div>

			<div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
				{Array.from({ length: count }).map((_, index) => (
					<PostCardSkeleton key={index} />
				))}
			</div>

			<div className="flex justify-center">
				<Skeleton className="h-10 w-40 rounded-md" />
			</div>
		</div>
	);
}
