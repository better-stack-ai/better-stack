"use client";

import type { ReactNode } from "react";
import type { FallbackProps } from "@btst/stack/client/components";
import {
	usePluginOverrides,
	usePluginSiteNavigation,
} from "@btst/stack/context";
import { Button } from "@workspace/ui/components/button";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from "@workspace/ui/components/empty";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { cn } from "@workspace/ui/lib/utils";
import type { EmploymentType } from "../../types";
import { JOB_BOARD_PLUGIN_ID } from "../constants";
import { useJobBoardLocalization } from "../hooks";
import type { JobBoardLocalization } from "../localization";
import type { JobBoardPluginOverrides } from "../overrides";

export function JobPage({ children }: { children: ReactNode }) {
	const { className } =
		usePluginOverrides<JobBoardPluginOverrides>(JOB_BOARD_PLUGIN_ID);
	return (
		<div
			data-testid="job-board-page"
			className={cn(
				"mx-auto flex w-full min-w-0 max-w-6xl flex-col gap-10 px-4 py-8 sm:px-6 sm:py-12",
				className,
			)}
		>
			{children}
		</div>
	);
}

export function JobLoading() {
	const copy = useJobBoardLocalization();
	return (
		<JobPage>
			<p role="status" className="text-muted-foreground">
				{copy.loading}
			</p>
			<Skeleton className="h-12 w-2/3" />
			<Skeleton className="h-24 w-full" />
			<Skeleton className="h-24 w-full" />
		</JobPage>
	);
}

export function JobError({ error, resetErrorBoundary }: FallbackProps) {
	const copy = useJobBoardLocalization();
	return (
		<JobPage>
			<div role="alert" className="flex max-w-xl flex-col gap-4">
				<h1 className="text-2xl font-semibold">{copy.errorTitle}</h1>
				<p className="text-muted-foreground">
					{process.env.NODE_ENV === "development" && error instanceof Error
						? error.message
						: copy.errorDescription}
				</p>
				<Button
					className="min-h-11 self-start"
					variant="outline"
					onClick={resetErrorBoundary}
				>
					{copy.retry}
				</Button>
			</div>
		</JobPage>
	);
}

export function JobNotFound() {
	const copy = useJobBoardLocalization();
	const { Link, resolve } = usePluginSiteNavigation(JOB_BOARD_PLUGIN_ID);
	return (
		<JobPage>
			<div className="flex max-w-xl flex-col gap-4">
				<h1 className="text-3xl font-semibold">{copy.notFoundTitle}</h1>
				<p className="text-muted-foreground">{copy.notFoundDescription}</p>
				<Button className="min-h-11 self-start" variant="outline" asChild>
					<Link href={resolve("jobs").href}>{copy.backToJobs}</Link>
				</Button>
			</div>
		</JobPage>
	);
}

export function JobsEmpty({ filtered }: { filtered: boolean }) {
	const copy = useJobBoardLocalization();
	return (
		<Empty className="items-start border text-left">
			<EmptyHeader className="items-start text-left">
				<EmptyTitle>{copy.emptyTitle}</EmptyTitle>
				<EmptyDescription>
					{filtered ? copy.filteredEmptyDescription : copy.emptyDescription}
				</EmptyDescription>
			</EmptyHeader>
		</Empty>
	);
}

export function employmentLabel(
	type: EmploymentType,
	copy: JobBoardLocalization,
) {
	return {
		"full-time": copy.fullTime,
		"part-time": copy.partTime,
		contract: copy.contract,
		internship: copy.internship,
	}[type];
}

export const jobSelectClass =
	"border-input bg-background min-h-11 w-full min-w-0 rounded-md border px-3 text-sm focus-visible:outline-2 focus-visible:outline-ring";
