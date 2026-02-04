import { PageHeaderSkeleton } from "./page-header-skeleton";
import { PageLayout } from "@workspace/ui/components/page-layout";
import { Skeleton } from "@workspace/ui/components/skeleton";

export function PostPageSkeleton() {
	return (
		<PageLayout>
			<div className="flex flex-col items-center gap-3">
				<PageHeaderSkeleton />
			</div>
			<PostSkeleton />
		</PageLayout>
	);
}

function PostSkeleton() {
	return (
		<div className="w-full space-y-8">
			{/* Title + Meta + Tags */}
			<div className="hidden space-y-4">
				{/* Title */}
				<Skeleton className="h-12 w-3/4" />

				{/* Meta: avatar, author, date */}
				<div className="flex items-center gap-3">
					<Skeleton className="h-8 w-8 rounded-full" />
					<Skeleton className="h-4 w-32" />
					<Skeleton className="h-4 w-24" />
				</div>

				{/* Tags */}
				<div className="flex flex-wrap gap-2">
					<Skeleton className="h-6 w-20 rounded-full" />
					<Skeleton className="h-6 w-16 rounded-full" />
					<Skeleton className="h-6 w-24 rounded-full" />
				</div>
			</div>

			{/* Hero / Cover image */}
			<Skeleton className="h-64 w-full rounded-md" />

			{/* Content blocks */}
			<div className="space-y-10">
				<ContentBlockSkeleton />
				<ImageBlockSkeleton />
				<CodeBlockSkeleton />
				<ContentBlockSkeleton />
			</div>
		</div>
	);
}

function ContentBlockSkeleton() {
	return (
		<div className="space-y-4">
			{/* Section heading */}
			<Skeleton className="h-8 w-1/3" />
			{/* Paragraph lines */}
			<div className="space-y-2">
				<Skeleton className="h-4 w-full" />
				<Skeleton className="h-4 w-11/12" />
				<Skeleton className="h-4 w-10/12" />
				<Skeleton className="h-4 w-9/12" />
			</div>
		</div>
	);
}

function ImageBlockSkeleton() {
	return <Skeleton className="h-72 w-full rounded-md" />;
}

function CodeBlockSkeleton() {
	return <Skeleton className="h-40 w-full rounded-md" />;
}
