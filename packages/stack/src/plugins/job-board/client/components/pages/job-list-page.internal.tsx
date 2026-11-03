"use client";

import { useState } from "react";
import { usePluginSiteNavigation } from "@btst/stack/context";
import { Button } from "@workspace/ui/components/button";
import { Label } from "@workspace/ui/components/label";
import type { EmploymentType, Job, JobsFilters } from "../../../types";
import { isJobOpen } from "../../../utils";
import { JOB_BOARD_PLUGIN_ID } from "../../constants";
import {
	useJobBoardHydrated,
	useJobBoardLocalization,
	useSuspenseJobs,
} from "../../hooks";
import { employmentLabel, JobPage, JobsEmpty, jobSelectClass } from "../shared";

function JobRow({ job }: { job: Job }) {
	const copy = useJobBoardLocalization();
	const { Link, resolve } = usePluginSiteNavigation(JOB_BOARD_PLUGIN_ID);
	return (
		<li>
			<Link
				aria-label={job.title}
				href={resolve("jobs", encodeURIComponent(job.slug)).href}
				className="group grid min-w-0 gap-4 py-6 transition-colors hover:bg-muted/40 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring motion-reduce:transition-none sm:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_auto] sm:items-center sm:gap-6 sm:py-7"
			>
				<div className="flex min-w-0 flex-col gap-2">
					<h2 className="break-words text-xl font-semibold leading-snug group-hover:underline group-hover:underline-offset-4 sm:text-2xl">
						{job.title}
					</h2>
					<span className="break-words text-sm text-muted-foreground">
						{job.department}
					</span>
				</div>
				<div className="flex min-w-0 flex-col gap-1 text-sm">
					<span className="break-words">{job.location}</span>
					{job.remote && (
						<span className="text-muted-foreground">{copy.remote}</span>
					)}
				</div>
				<div className="flex items-center justify-between gap-4 text-sm sm:flex-col sm:items-end sm:gap-2">
					<span>{employmentLabel(job.employmentType, copy)}</span>
					<span className="font-medium underline underline-offset-4">
						{copy.viewRole}
					</span>
				</div>
			</Link>
		</li>
	);
}

export function JobListPage({ department }: { department?: string }) {
	const copy = useJobBoardLocalization();
	const { Link, resolve } = usePluginSiteNavigation(JOB_BOARD_PLUGIN_ID);
	const [state, setFilterState] = useState({
		department: "",
		location: "",
		employmentType: "",
		remote: false,
	});
	const setState = (patch: Partial<typeof state>) =>
		setFilterState((current) => ({ ...current, ...patch }));
	const employmentType = [
		"full-time",
		"part-time",
		"contract",
		"internship",
	].includes(state.employmentType)
		? (state.employmentType as EmploymentType)
		: undefined;
	const filters: JobsFilters = {
		department: department || state.department || undefined,
		location: state.location || undefined,
		employmentType,
		remote: state.remote || undefined,
	};
	const { data, fetchNextPage, hasNextPage, isFetchingNextPage } =
		useSuspenseJobs(filters);
	const hydrated = useJobBoardHydrated();
	const jobs = data.pages
		.flatMap((page) => page.items)
		.filter((job) => !hydrated || isJobOpen(job));
	const firstPage = data.pages[0];
	const taxonomies = firstPage?.taxonomies;
	const filtered = !!(
		filters.department ||
		filters.location ||
		filters.employmentType ||
		filters.remote
	);
	const canClear = !!(
		(!department && state.department) ||
		state.location ||
		state.employmentType ||
		state.remote
	);
	return (
		<JobPage>
			<header className="flex max-w-3xl flex-col gap-4">
				{department && (
					<Link
						className="inline-flex min-h-11 items-center self-start text-sm underline underline-offset-4"
						href={resolve("jobs").href}
					>
						{copy.backToJobs}
					</Link>
				)}
				<h1 className="break-words text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
					{department
						? copy.departmentTitle.replace("{department}", department)
						: copy.title}
				</h1>
				<p className="max-w-2xl text-lg leading-relaxed text-muted-foreground">
					{copy.intro}
				</p>
			</header>
			<fieldset className="grid min-w-0 gap-4 rounded-lg border bg-muted/20 p-4 sm:grid-cols-2 lg:grid-cols-4 lg:p-5">
				<legend className="sr-only">{copy.title}</legend>
				{!department && (
					<div className="flex min-w-0 flex-col gap-2">
						<Label htmlFor="job-board-department">{copy.department}</Label>
						<select
							id="job-board-department"
							className={jobSelectClass}
							value={state.department}
							onChange={(event) => setState({ department: event.target.value })}
						>
							<option value="">{copy.allDepartments}</option>
							{taxonomies?.departments.map((value) => (
								<option key={value} value={value}>
									{value}
								</option>
							))}
						</select>
					</div>
				)}
				<div className="flex min-w-0 flex-col gap-2">
					<Label htmlFor="job-board-location">{copy.location}</Label>
					<select
						id="job-board-location"
						className={jobSelectClass}
						value={state.location}
						onChange={(event) => setState({ location: event.target.value })}
					>
						<option value="">{copy.allLocations}</option>
						{taxonomies?.locations.map((value) => (
							<option key={value} value={value}>
								{value}
							</option>
						))}
					</select>
				</div>
				<div className="flex min-w-0 flex-col gap-2">
					<Label htmlFor="job-board-type">{copy.employmentType}</Label>
					<select
						id="job-board-type"
						className={jobSelectClass}
						value={state.employmentType}
						onChange={(event) =>
							setState({ employmentType: event.target.value })
						}
					>
						<option value="">{copy.allEmploymentTypes}</option>
						{taxonomies?.employmentTypes.map((value) => (
							<option key={value} value={value}>
								{employmentLabel(value, copy)}
							</option>
						))}
					</select>
				</div>
				<label className="flex min-h-11 items-center gap-3 self-end text-sm">
					<input
						className="size-5 accent-primary"
						type="checkbox"
						checked={state.remote}
						onChange={(event) => setState({ remote: event.target.checked })}
					/>
					{copy.remoteOnly}
				</label>
			</fieldset>
			<section aria-label={copy.title} className="flex min-w-0 flex-col gap-5">
				<div className="flex flex-wrap items-center justify-between gap-3">
					<p role="status" className="text-sm text-muted-foreground">
						{copy.openRoles.replace("{count}", String(firstPage?.total ?? 0))}
					</p>
					{canClear && (
						<Button
							className="min-h-11"
							variant="ghost"
							onClick={() =>
								setState({
									department: "",
									location: "",
									employmentType: "",
									remote: false,
								})
							}
						>
							{copy.clearFilters}
						</Button>
					)}
				</div>
				{jobs.length ? (
					<ul className="flex min-w-0 flex-col divide-y border-y">
						{jobs.map((job) => (
							<JobRow key={job.id} job={job} />
						))}
					</ul>
				) : (
					<JobsEmpty filtered={filtered} />
				)}
				{hasNextPage && (
					<Button
						className="min-h-11 self-center"
						variant="outline"
						disabled={isFetchingNextPage}
						onClick={() => void fetchNextPage()}
					>
						{isFetchingNextPage ? copy.loadingMore : copy.loadMore}
					</Button>
				)}
			</section>
		</JobPage>
	);
}
