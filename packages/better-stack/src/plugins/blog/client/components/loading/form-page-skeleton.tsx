import { PageHeaderSkeleton } from "./page-header-skeleton";
import { PageLayout } from "@workspace/ui/components/page-layout";
import { Skeleton } from "@workspace/ui/components/skeleton";

export function FormPageSkeleton() {
	return (
		<PageLayout>
			<div className="flex flex-col items-center gap-3">
				<PageHeaderSkeleton />
			</div>
			<FormSkeleton />
		</PageLayout>
	);
}

function FormSkeleton() {
	return (
		<div className="w-full space-y-8">
			{/* Two-column basics */}
			<div className="grid grid-cols-1 gap-6 md:grid-cols-2">
				<div className="space-y-2">
					<Skeleton className="h-4 w-24" />
					<Skeleton className="h-10 w-full rounded-md" />
				</div>
				<div className="space-y-2">
					<Skeleton className="h-4 w-28" />
					<Skeleton className="h-10 w-full rounded-md" />
				</div>
			</div>

			{/* Long text / description */}
			<div className="space-y-2">
				<Skeleton className="h-4 w-24" />
				<Skeleton className="h-24 w-full rounded-md" />
			</div>

			{/* Selects / dates */}
			<div className="grid grid-cols-1 gap-6 md:grid-cols-2">
				<div className="space-y-2">
					<Skeleton className="h-4 w-28" />
					<Skeleton className="h-10 w-full rounded-md" />
				</div>
				<div className="space-y-2">
					<Skeleton className="h-4 w-24" />
					<Skeleton className="h-10 w-full rounded-md" />
				</div>
			</div>

			{/* Checks / toggles */}
			<div className="space-y-3">
				<Skeleton className="h-4 w-32" />
				<div className="flex items-center gap-3">
					<Skeleton className="h-5 w-5 rounded-sm" />
					<Skeleton className="h-4 w-44" />
				</div>
				<div className="flex items-center gap-3">
					<Skeleton className="h-5 w-5 rounded-sm" />
					<Skeleton className="h-4 w-36" />
				</div>
			</div>

			{/* Media / attachments */}
			<div className="space-y-2">
				<Skeleton className="h-4 w-36" />
				<Skeleton className="h-32 w-full rounded-md" />
			</div>

			{/* Actions */}
			<div className="flex justify-end gap-3 pt-2">
				<Skeleton className="h-10 w-24 rounded-md" />
				<Skeleton className="h-10 w-28 rounded-md" />
			</div>
		</div>
	);
}
