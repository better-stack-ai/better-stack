"use client";

import { usePluginSiteNavigation, useStack } from "@btst/stack/context";
import { MarkdownContent } from "@btst/stack/components/markdown";
import { useRegisterPageAIContext } from "@btst/stack/plugins/ai-chat/client/context";
import { FormRenderer } from "@btst/stack/plugins/form-builder/client/components";
import { Button } from "@workspace/ui/components/button";
import {
	createJobPostingStructuredData,
	serializeJobPostingStructuredData,
} from "../../../structured-data";
import { encodeJobDepartment, isJobOpen } from "../../../utils";
import { JOB_BOARD_PLUGIN_ID } from "../../constants";
import {
	useJobBoardHydrated,
	useJobBoardLocalization,
	useSuspenseJob,
} from "../../hooks";
import type { JobBoardProviderConfig } from "../../types";
import { employmentLabel, JobNotFound, JobPage } from "../shared";

export function JobDetailPage({ slug }: { slug: string }) {
	const { data: job } = useSuspenseJob(slug);
	const copy = useJobBoardLocalization();
	const { Link, resolve } = usePluginSiteNavigation(JOB_BOARD_PLUGIN_ID);
	const { plugins, router } = useStack();
	const hydrated = useJobBoardHydrated();
	const open = !hydrated || isJobOpen(job);
	const provider = plugins?.[JOB_BOARD_PLUGIN_ID]?.config as
		| JobBoardProviderConfig
		| undefined;
	const site = plugins?.[JOB_BOARD_PLUGIN_ID]?.site;
	const url = site?.baseURL
		? `${site.baseURL}${resolve("jobs", encodeURIComponent(job.slug)).path}`
		: undefined;
	const applicationAvailable = !!(
		job.applicationFormSlug && plugins?.formBuilder
	);
	useRegisterPageAIContext(
		open
			? {
					routeName: "job-board-detail",
					pageDescription:
						`Job: ${job.title}\nDepartment: ${job.department}\nLocation: ${job.location}\nEmployment type: ${job.employmentType}\n\n${job.description}\n\nRequirements:\n${job.requirements}`.slice(
							0,
							16000,
						),
					suggestions: [
						"What are the requirements for this role?",
						"Summarize the responsibilities",
						"What should I include in my application?",
					],
				}
			: null,
	);
	if (!open) return <JobNotFound />;
	return (
		<JobPage>
			<script
				type="application/ld+json"
				dangerouslySetInnerHTML={{
					__html: serializeJobPostingStructuredData(
						createJobPostingStructuredData(job, {
							url,
							organization: provider?.organization,
						}),
					),
				}}
			/>
			<header className="flex min-w-0 max-w-4xl flex-col gap-5">
				<Link
					className="inline-flex min-h-11 items-center self-start text-sm underline underline-offset-4"
					href={resolve("jobs").href}
				>
					{copy.backToJobs}
				</Link>
				<Link
					className="inline-flex min-h-11 items-center self-start text-sm text-muted-foreground underline underline-offset-4"
					href={
						resolve("jobs", "department", encodeJobDepartment(job.department))
							.href
					}
				>
					{job.department}
				</Link>
				<h1 className="break-words text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
					{job.title}
				</h1>
			</header>
			<div className="grid min-w-0 gap-10 lg:grid-cols-[minmax(0,1fr)_18rem] lg:gap-14">
				<aside className="order-first flex min-w-0 flex-col gap-6 self-start rounded-lg border p-5 lg:order-last lg:p-6">
					<dl className="grid min-w-0 grid-cols-2 gap-5 text-sm sm:grid-cols-3 lg:grid-cols-1">
						<div className="flex min-w-0 flex-col gap-1">
							<dt className="text-muted-foreground">{copy.location}</dt>
							<dd className="break-words font-medium">{job.location}</dd>
						</div>
						<div className="flex flex-col gap-1">
							<dt className="text-muted-foreground">{copy.employmentType}</dt>
							<dd className="font-medium">
								{employmentLabel(job.employmentType, copy)}
							</dd>
						</div>
						<div className="flex flex-col gap-1">
							<dt className="text-muted-foreground">{copy.workplace}</dt>
							<dd className="font-medium">
								{job.remote ? copy.remote : copy.onSite}
							</dd>
						</div>
						{job.salary && (
							<div className="flex min-w-0 flex-col gap-1">
								<dt className="text-muted-foreground">{copy.salary}</dt>
								<dd className="break-words font-medium">{job.salary}</dd>
							</div>
						)}
						{job.closingDate && (
							<div className="flex flex-col gap-1">
								<dt className="text-muted-foreground">{copy.closingDate}</dt>
								<dd className="font-medium">
									<time dateTime={job.closingDate}>
										{new Intl.DateTimeFormat("en", {
											year: "numeric",
											month: "long",
											day: "numeric",
											timeZone: "UTC",
										}).format(new Date(`${job.closingDate}T00:00:00Z`))}
									</time>
								</dd>
							</div>
						)}
					</dl>
					{applicationAvailable ? (
						<Button className="min-h-11" asChild>
							<a href="#apply">{copy.apply}</a>
						</Button>
					) : (
						<p className="text-sm text-muted-foreground">
							{copy.applicationsUnavailable}
						</p>
					)}
				</aside>
				<article className="order-last flex min-w-0 max-w-prose flex-col gap-10 lg:order-first">
					<section className="flex min-w-0 flex-col gap-4">
						<h2 className="text-2xl font-semibold">{copy.aboutRole}</h2>
						<MarkdownContent
							markdown={job.description}
							LinkComponent={router?.Link}
							ImageComponent={router?.Image}
						/>
					</section>
					{job.requirements && (
						<section className="flex min-w-0 flex-col gap-4">
							<h2 className="text-2xl font-semibold">{copy.requirements}</h2>
							<MarkdownContent
								markdown={job.requirements}
								LinkComponent={router?.Link}
								ImageComponent={router?.Image}
							/>
						</section>
					)}
				</article>
			</div>
			{applicationAvailable && (
				<section
					id="apply"
					aria-labelledby="job-board-application-heading"
					className="flex min-w-0 max-w-prose scroll-mt-8 flex-col gap-5 rounded-lg border p-5 sm:p-7"
				>
					<h2
						id="job-board-application-heading"
						className="text-2xl font-semibold"
					>
						{copy.application}
					</h2>
					<p className="text-muted-foreground">{copy.applicationDescription}</p>
					<FormRenderer
						key={`${job.id}:${job.applicationFormSlug}`}
						slug={job.applicationFormSlug!}
					/>
				</section>
			)}
		</JobPage>
	);
}
