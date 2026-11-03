import {
	createApiClient,
	createSanitizedSSRLoaderError,
	defineClientPlugin,
	isConnectionError,
} from "@btst/stack/plugins/client";
import { createJobBoardQueryKeys } from "@btst/stack/plugins/job-board/query-keys";
import { defineRoute, defineRoutes } from "@btst/yar";
import { lazy } from "react";
import type { Job } from "../types";
import { decodeJobDepartment, encodeJobDepartment } from "../utils";
import { JOB_BOARD_PLUGIN_ID } from "./constants";
import { jobBoardLocalization } from "./localization";
import type { JobBoardPluginOverrides } from "./overrides";
import type {
	JobBoardClientConfig,
	JobBoardLoaderContext,
	JobBoardProviderConfig,
} from "./types";

const List = lazy(() =>
	import("./components/pages/job-list-page").then((module) => ({
		default: module.JobListPageComponent,
	})),
);
const Detail = lazy(() =>
	import("./components/pages/job-detail-page").then((module) => ({
		default: module.JobDetailPageComponent,
	})),
);
const Department = lazy(() =>
	import("./components/pages/department-page").then((module) => ({
		default: module.DepartmentPageComponent,
	})),
);

/** Public careers routes backed by the server-filtered CMS job projection. */
export const jobBoardClientPlugin = (config: JobBoardClientConfig = {}) =>
	defineClientPlugin<JobBoardPluginOverrides>()({
		id: JOB_BOARD_PLUGIN_ID,
		providerConfig: {
			organization: config.organization,
		} satisfies JobBoardProviderConfig,
		resolve: (runtime) => {
			const queries = createJobBoardQueryKeys(
				createApiClient({ ...runtime.api }),
			);
			const origin = `${runtime.site.baseURL}${runtime.site.basePath}`;
			const listQuery = (department?: string) =>
				queries.jobBoardJobs.list(department ? { department } : {});
			const preload =
				(
					context: JobBoardLoaderContext,
					query: {
						queryKey: readonly unknown[];
						queryFn: (context?: { pageParam?: unknown }) => Promise<unknown>;
					},
					infinite = false,
				) =>
				async () => {
					if (typeof window !== "undefined") return;
					const fetch = (queryFn = query.queryFn, force = false) =>
						infinite
							? runtime.queryClient.prefetchInfiniteQuery({
									...query,
									queryFn,
									initialPageParam: 0,
									retry: false,
									...(force ? { staleTime: 0 } : {}),
								})
							: runtime.queryClient.prefetchQuery({
									...query,
									queryFn: () => queryFn(),
									retry: false,
									...(force ? { staleTime: 0 } : {}),
								});
					let error: unknown;
					try {
						await config.hooks?.beforeLoad?.(context);
						await fetch();
						error = runtime.queryClient.getQueryState(query.queryKey)?.error;
						if (!error) await config.hooks?.afterLoad?.(context);
					} catch (caught) {
						error = caught;
						await fetch(async () => {
							throw createSanitizedSSRLoaderError();
						}, true);
					}
					if (!error) return;
					if (isConnectionError(error))
						console.warn(
							"[btst/job-board] API unavailable during SSR prefetch. Use raw.jobBoard.prefetchForRoute for SSG.",
						);
					try {
						await config.hooks?.onErrorLoad?.(
							error instanceof Error ? error : new Error(String(error)),
							context,
						);
					} catch {
						// Reporting a load failure must not reject the route loader.
					}
				};
			const meta = (title: string, description: string, path: string) => [
				{ title },
				{ name: "title", content: title },
				{ name: "description", content: description },
				{ property: "og:title", content: title },
				{ property: "og:description", content: description },
				{ property: "og:type", content: "website" },
				{ property: "og:url", content: `${origin}${path}` },
			];
			return {
				routes: () =>
					defineRoutes(
						{
							jobBoardList: defineRoute("/jobs", {
								page: List,
								loader: preload(
									{ routeName: "list", path: "/jobs", isSSR: true },
									listQuery(),
									true,
								),
								meta: () =>
									meta(
										jobBoardLocalization.title,
										jobBoardLocalization.intro,
										"/jobs",
									),
							}),
							jobBoardDetail: defineRoute("/jobs/:slug", {
								page: ({ params }) => <Detail slug={params.slug} />,
								loader: ({ params }) =>
									preload(
										{
											routeName: "detail",
											path: `/jobs/${params.slug}`,
											params,
											isSSR: true,
										},
										queries.jobBoardJobs.detail(params.slug),
									)(),
								meta: ({ params }) => {
									const job = runtime.queryClient.getQueryData<Job>(
										queries.jobBoardJobs.detail(params.slug).queryKey,
									);
									return meta(
										job?.title ?? jobBoardLocalization.notFoundTitle,
										job?.description.slice(0, 200) ??
											jobBoardLocalization.notFoundDescription,
										`/jobs/${encodeURIComponent(params.slug)}`,
									);
								},
							}),
							jobBoardDepartment: defineRoute("/jobs/department/:dept", {
								page: ({ params }) => (
									<Department department={decodeJobDepartment(params.dept)} />
								),
								loader: async ({ params }) => {
									const department = decodeJobDepartment(params.dept);
									if (!department) return;
									return preload(
										{
											routeName: "department",
											path: `/jobs/department/${params.dept}`,
											params: { dept: department },
											isSSR: true,
										},
										listQuery(department),
										true,
									)();
								},
								meta: ({ params }) => {
									const department = decodeJobDepartment(params.dept);
									return meta(
										department
											? jobBoardLocalization.departmentTitle.replace(
													"{department}",
													department,
												)
											: jobBoardLocalization.notFoundTitle,
										jobBoardLocalization.intro,
										`/jobs/department/${params.dept}`,
									);
								},
							}),
						},
						{
							pages: {
								jobBoardList: config.pageComponents?.list,
								jobBoardDetail: config.pageComponents?.detail,
								jobBoardDepartment: config.pageComponents?.department,
							},
						},
					),
				sitemap: async () => {
					const jobs: Job[] = [];
					let offset = 0;
					while (true) {
						const page = await queries.jobBoardJobs
							.list({ limit: 100 })
							.queryFn({ pageParam: offset });
						jobs.push(...page.items);
						offset += page.items.length;
						if (!page.items.length || offset >= page.total) break;
					}
					return [
						{ url: `${origin}/jobs`, changeFrequency: "daily" as const },
						...jobs.map((job) => ({
							url: `${origin}/jobs/${encodeURIComponent(job.slug)}`,
							lastModified: job.updatedAt,
							changeFrequency: "daily" as const,
						})),
						...[...new Set(jobs.map((job) => job.department))].map(
							(department) => ({
								url: `${origin}/jobs/department/${encodeJobDepartment(department)}`,
								changeFrequency: "daily" as const,
							}),
						),
					];
				},
			};
		},
	});
