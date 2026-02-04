import {
	Card,
	CardContent,
	CardFooter,
	CardHeader,
} from "@workspace/ui/components/card";
import { Skeleton } from "@workspace/ui/components/skeleton";

export function PostCardSkeleton() {
	return (
		<Card className="h-full">
			<div className="relative h-48 w-full">
				<Skeleton className="h-full w-full rounded-t-xl" />
			</div>
			<CardHeader>
				<Skeleton className="mb-2 h-4 w-24" />
				<Skeleton className="mb-2 h-6 w-full" />
			</CardHeader>
			<CardContent>
				<Skeleton className="h-4 w-32" />
			</CardContent>
			<CardFooter>
				<div className="flex w-full items-center justify-between">
					<Skeleton className="h-5 w-16" />
					<Skeleton className="h-8 w-20" />
				</div>
			</CardFooter>
		</Card>
	);
}
