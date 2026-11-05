import { Skeleton } from "@workspace/ui/components/skeleton";

export function PostNavigationSkeleton() {
	return (
		<div className="border-t mt-4 pt-4 w-full flex flex-col sm:flex-row gap-4">
			<Skeleton className="h-14 flex-1 rounded-md" />
			<Skeleton className="h-14 flex-1 rounded-md" />
		</div>
	);
}
