"use client";

import { useState, useRef, useEffect, type FormEvent } from "react";
import { useRegisterPageAIContext } from "@btst/stack/page-context";
import { PermissionAccess, useStack } from "@btst/stack/context";
import { analyticsPermissions } from "../../../permissions";
import type {
	AnalyticsRangeParams,
	AnalyticsMetric,
	AnalyticsDimension,
} from "../../../types";
import { RankedCard } from "../ranked-card";
import { TrafficChart } from "../traffic-chart";
import { FunnelReport } from "../funnel-report";
import { useRealtimeVisitors, useSuspenseDashboardStats } from "../../hooks";
import { ANALYTICS_PLUGIN_ID } from "../../constants";
import { ExperimentReport } from "../experiment-report";

const number = new Intl.NumberFormat("en");
const metricDefinitions: {
	key: AnalyticsMetric;
	label: string;
	description: string;
}[] = [
	{
		key: "uniqueVisitors",
		label: "Visitors",
		description:
			"Distinct anonymous session identifiers, not persistent people. Identifiers reset on reload and each UTC day.",
	},
	{
		key: "pageViews",
		label: "Page views",
		description: "Recorded page views, including repeat views.",
	},
	{
		key: "bounceRate",
		label: "Bounce rate",
		description:
			"Visits with exactly one page view divided by all visits. Custom events do not prevent a bounce.",
	},
	{
		key: "sessionDuration",
		label: "Session duration",
		description:
			"Average time between first and last page views. Single-page visits count as zero.",
	},
];
function FunnelDrawer({
	params,
	onClose,
}: {
	params: AnalyticsRangeParams;
	onClose: () => void;
}) {
	const dialog = useRef<HTMLDialogElement>(null);
	useEffect(() => {
		const element = dialog.current!;
		element.showModal();
		return () => element.close();
	}, []);
	return (
		<dialog
			ref={dialog}
			className="analytics-drawer"
			aria-label="Conversion funnel"
			onClose={onClose}
		>
			<div className="analytics-drawer-heading">
				<h2>Funnels</h2>
				<button
					type="button"
					onClick={() => dialog.current?.close()}
					aria-label="Close funnel"
				>
					Close
				</button>
			</div>
			<FunnelReport range={params} />
		</dialog>
	);
}

/** Dynamic dashboard; all displayed counts come from the authenticated API. */
export function AnalyticsDashboardPage({
	experiments = [],
}: {
	experiments?: string[];
} = {}) {
	const [params, setParams] = useState<AnalyticsRangeParams>({ range: "7d" });
	const [custom, setCustom] = useState(false);
	const [funnelOpen, setFunnelOpen] = useState(false);
	const [metric, setMetric] = useState<AnalyticsMetric>("uniqueVisitors");
	const [start, setStart] = useState(() =>
		new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10),
	);
	const [end, setEnd] = useState(() => new Date().toISOString().slice(0, 10));
	const [rangeError, setRangeError] = useState("");
	const [exportError, setExportError] = useState("");
	const [exporting, setExporting] = useState(false);
	const { data: stats, isFetching } = useSuspenseDashboardStats(params);
	const realtime = useRealtimeVisitors(params.environment);
	const { plugins } = useStack();
	const api = plugins?.[ANALYTICS_PLUGIN_ID]?.api;
	useRegisterPageAIContext({
		routeName: "analytics-dashboard",
		pageDescription: JSON.stringify({
			page: "Read-only Analytics dashboard summary. No mutation tools are available.",
			range: params,
			uniqueVisitors: stats.uniqueVisitors,
			pageViews: stats.pageViews,
			bounceRate: stats.bounceRate,
			sessionDurationSeconds: stats.sessionDuration,
			realtimeVisitors: realtime.data?.visitors,
		}),
	});

	function applyRange(event: FormEvent) {
		event.preventDefault();
		if (!start || !end || start > end) {
			setRangeError("Choose a start date on or before the end date.");
			return;
		}
		if (Date.parse(end) - Date.parse(start) > 366 * 86400000) {
			setRangeError("Choose a range of 366 days or fewer.");
			return;
		}
		setRangeError("");
		setParams({ ...params, range: "custom", start, end });
	}

	async function exportCSV() {
		setExporting(true);
		setExportError("");
		try {
			const query = new URLSearchParams();
			for (const [key, value] of Object.entries(params))
				if (value !== undefined) query.set(key, String(value));
			const url = `${api?.baseURL ?? ""}${(api?.basePath ?? "/api/data").replace(/\/$/, "")}/analytics/export?${query}`;
			const response = await fetch(url, {
				headers: api?.browserHeaders,
				credentials: api?.credentials ?? "same-origin",
			});
			if (!response.ok) throw new Error("Export failed");
			const download = URL.createObjectURL(await response.blob());
			const link = document.createElement("a");
			link.href = download;
			link.download = "analytics-events.csv";
			link.click();
			setTimeout(() => URL.revokeObjectURL(download), 1000);
		} catch {
			setExportError(
				"Events could not be exported. Check your export access and try again.",
			);
		} finally {
			setExporting(false);
		}
	}

	const dimension = (field: AnalyticsDimension) =>
		stats.dimensions?.[field] ?? [];
	const countryNames = new Intl.DisplayNames(["en"], { type: "region" });
	const formatMetric = (key: AnalyticsMetric, value: number) =>
		key === "bounceRate"
			? `${value.toFixed(1)}%`
			: key === "sessionDuration"
				? `${Math.floor(value / 60)}m ${Math.round(value % 60)}s`
				: number.format(value);
	return (
		<main
			className="analytics-dashboard"
			data-testid="analytics-dashboard"
			aria-busy={isFetching}
		>
			<header className="analytics-header">
				<div className="analytics-identity">
					<h1>Analytics</h1>
					<span
						className="analytics-live"
						aria-live="polite"
						title="Anonymous sessions with a page view in the last five minutes"
					>
						{realtime.isError ? (
							"Live count unavailable"
						) : realtime.data ? (
							<>
								<span aria-hidden="true" className="analytics-live-dot" />
								<strong>{number.format(realtime.data.visitors)}</strong> online
							</>
						) : (
							"Loading live count…"
						)}
					</span>
				</div>
				<div className="analytics-toolbar">
					<label className="analytics-sr-only" htmlFor="analytics-environment">
						Environment
					</label>
					<select
						id="analytics-environment"
						value={params.environment ?? ""}
						onChange={(event) =>
							setParams({
								...params,
								environment: event.target.value || undefined,
							})
						}
					>
						<option value="">All environments</option>
						{[
							...new Set([
								...(stats.environments ?? []),
								...(params.environment ? [params.environment] : []),
							]),
						].map((value) => (
							<option key={value} value={value}>
								{value}
							</option>
						))}
					</select>
					<label className="analytics-sr-only" htmlFor="analytics-range">
						Date range
					</label>
					<select
						id="analytics-range"
						value={custom ? "custom" : params.range}
						onChange={(event) => {
							const range = event.target.value as AnalyticsRangeParams["range"];
							setCustom(range === "custom");
							setRangeError("");
							if (range !== "custom")
								setParams(
									params.environment
										? { range, environment: params.environment }
										: { range },
								);
						}}
					>
						<option value="today">Today</option>
						<option value="7d">Last 7 days</option>
						<option value="30d">Last 30 days</option>
						<option value="custom">Custom</option>
					</select>
					<PermissionAccess
						permission={analyticsPermissions.dashboard.read({})}
					>
						<button type="button" onClick={() => setFunnelOpen(true)}>
							Funnels
						</button>
					</PermissionAccess>
					<PermissionAccess
						permission={analyticsPermissions.dashboard.export({})}
					>
						<details className="analytics-overflow">
							<summary aria-label="More analytics actions">•••</summary>
							<div>
								<button
									type="button"
									disabled={exporting}
									onClick={() => void exportCSV()}
								>
									{exporting ? "Exporting…" : "Export CSV"}
								</button>
							</div>
						</details>
					</PermissionAccess>
				</div>
			</header>
			{custom && (
				<form className="analytics-custom-range" onSubmit={applyRange}>
					<label>
						Start date
						<input
							type="date"
							value={start}
							max={end || undefined}
							onChange={(event) => setStart(event.target.value)}
							required
						/>
					</label>
					<label>
						End date
						<input
							type="date"
							value={end}
							min={start || undefined}
							onChange={(event) => setEnd(event.target.value)}
							required
						/>
					</label>
					<button type="submit">Apply dates</button>
					<span>Dates use UTC.</span>
				</form>
			)}
			{rangeError && (
				<p role="alert" className="analytics-error">
					{rangeError}
				</p>
			)}
			{exportError && (
				<p role="alert" className="analytics-error">
					{exportError}
				</p>
			)}
			<section className="analytics-overview" aria-label="Traffic overview">
				<div
					className="analytics-metrics"
					role="group"
					aria-label="Chart metric"
				>
					{metricDefinitions.map((item) => {
						const previous = stats.previous?.[item.key];
						const change = previous
							? ((stats[item.key] - previous) / previous) * 100
							: null;
						return (
							<button
								type="button"
								key={item.key}
								aria-pressed={metric === item.key}
								title={item.description}
								aria-describedby={`analytics-${item.key}-definition`}
								onClick={() => setMetric(item.key)}
							>
								<span>{item.label}</span>
								<div>
									<strong>{formatMetric(item.key, stats[item.key])}</strong>
									{change !== null ? (
										<small
											className={
												change === 0
													? ""
													: (
																item.key === "bounceRate"
																	? change < 0
																	: change > 0
															)
														? "analytics-change-positive"
														: "analytics-change-negative"
											}
											title={`Compared with preceding equal-duration period: ${stats.comparison?.start ?? ""} to ${stats.comparison?.end ?? ""}`}
										>
											{change > 0 ? "+" : ""}
											{change.toFixed(0)}%
										</small>
									) : (
										<small>No prior data</small>
									)}
								</div>
							</button>
						);
					})}
				</div>
				{stats.pageViews === 0 && (
					<p className="analytics-empty" role="status">
						No page views in this range. Visit a tracked page or choose another
						date range.
					</p>
				)}
				<TrafficChart
					page="analyticsDashboard"
					series={stats.series}
					metric={metric}
				/>
			</section>
			<div className="analytics-grid analytics-grid-two">
				<RankedCard
					title="Pages"
					tabs={[
						{
							label: "Pages",
							rows: stats.topPages.map((row) => ({
								value: row.path,
								visitors: row.visitors,
								views: row.views,
								trend: row.trend,
							})),
						},
						{ label: "Routes", rows: dimension("route") },
						{ label: "Hostnames", rows: dimension("hostname") },
					]}
				/>
				<RankedCard
					title="Acquisition"
					tabs={[
						{
							label: "Referrers",
							rows: stats.topReferrers.map((row) => ({
								value: row.referrer || "Direct",
								visitors: row.visitors,
								views: row.views,
							})),
						},
						...(
							[
								["utmSource", "UTM source"],
								["utmMedium", "Medium"],
								["utmCampaign", "Campaign"],
								["utmTerm", "Term"],
								["utmContent", "Content"],
							] as const
						).map(([key, label]) => ({ label, rows: dimension(key) })),
					]}
				/>
			</div>
			<div className="analytics-grid analytics-grid-three">
				<RankedCard
					title="Countries"
					tabs={[
						{
							label: "Countries",
							rows: dimension("country").map((row) => ({
								...row,
								value: /^[A-Z]{2}$/.test(row.value)
									? (countryNames.of(row.value) ?? row.value)
									: row.value,
							})),
						},
					]}
					percentageOf={stats.uniqueVisitors}
				/>
				<RankedCard
					title="Devices and browsers"
					tabs={[
						{ label: "Devices", rows: dimension("device") },
						{ label: "Browsers", rows: dimension("browser") },
					]}
					percentageOf={stats.uniqueVisitors}
				/>
				<RankedCard
					title="Operating systems"
					tabs={[
						{ label: "Operating systems", rows: dimension("operatingSystem") },
					]}
					percentageOf={stats.uniqueVisitors}
				/>
			</div>
			<section className="analytics-card analytics-events" aria-label="Events">
				<div className="analytics-card-heading">
					<h2>Events</h2>
					<span>Actions visitors took</span>
				</div>
				<div className="analytics-table-scroll">
					<table>
						<thead>
							<tr>
								<th scope="col">Event</th>
								<th scope="col">Visitors</th>
								<th scope="col">Total</th>
							</tr>
						</thead>
						<tbody>
							{stats.topEvents.length ? (
								stats.topEvents.map((event) => (
									<tr key={event.name}>
										<th scope="row">{event.name}</th>
										<td>
											{event.visitors === undefined
												? "—"
												: number.format(event.visitors)}
										</td>
										<td>{number.format(event.count)}</td>
									</tr>
								))
							) : (
								<tr>
									<td colSpan={3}>No custom events in this range.</td>
								</tr>
							)}
						</tbody>
					</table>
				</div>
			</section>
			{experiments.map((experimentKey) => (
				<PermissionAccess
					key={experimentKey}
					permission={analyticsPermissions.experiments.read({ experimentKey })}
				>
					<ExperimentReport
						experimentKey={experimentKey}
						params={{ ...params, environment: undefined }}
					/>
				</PermissionAccess>
			))}
			<details className="analytics-definitions">
				<summary>About these metrics</summary>
				{metricDefinitions.map((item) => (
					<p key={item.key} id={`analytics-${item.key}-definition`}>
						<strong>{item.label}:</strong> {item.description}
					</p>
				))}
				<p>
					Anonymous sessions are held in memory. No analytics cookies are
					created. Missing dimensions are shown as Unknown; old records cannot
					be backfilled. UTM labels describe the first page of each session.
					Comparisons use the preceding equal-duration window and require
					retained data.
				</p>
			</details>
			{funnelOpen && (
				<FunnelDrawer
					key={JSON.stringify(params)}
					params={params}
					onClose={() => setFunnelOpen(false)}
				/>
			)}
		</main>
	);
}
