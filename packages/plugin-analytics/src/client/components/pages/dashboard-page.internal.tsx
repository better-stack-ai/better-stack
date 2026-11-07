"use client";

import { useState, type FormEvent } from "react";
import { useRegisterPageAIContext } from "@btst/stack/page-context";
import { PermissionAccess, useStack } from "@btst/stack/context";
import { analyticsPermissions } from "../../../permissions";
import type { AnalyticsRangeParams } from "../../../types";
import { TrafficChart } from "../traffic-chart";
import { FunnelReport } from "../funnel-report";
import { useRealtimeVisitors, useSuspenseDashboardStats } from "../../hooks";
import { ANALYTICS_PLUGIN_ID } from "../../constants";
import { ExperimentReport } from "../experiment-report";

const number = new Intl.NumberFormat("en");
const presets = [
	{ value: "today", label: "Today" },
	{ value: "7d", label: "7 days" },
	{ value: "30d", label: "30 days" },
] as const;

function Sparkline({ values }: { values: number[] }) {
	const max = Math.max(1, ...values);
	return (
		<svg className="analytics-sparkline" viewBox="0 0 96 28" aria-hidden="true">
			<polyline
				fill="none"
				stroke="currentColor"
				strokeWidth="2"
				points={values
					.map(
						(value, index) =>
							`${(index * 96) / Math.max(1, values.length - 1)},${26 - (value / max) * 24}`,
					)
					.join(" ")}
			/>
		</svg>
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
	const [start, setStart] = useState(() =>
		new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10),
	);
	const [end, setEnd] = useState(() => new Date().toISOString().slice(0, 10));
	const [rangeError, setRangeError] = useState("");
	const [exportError, setExportError] = useState("");
	const [exporting, setExporting] = useState(false);
	const { data: stats, isFetching } = useSuspenseDashboardStats(params);
	const realtime = useRealtimeVisitors();
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
		setParams({ range: "custom", start, end });
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

	const duration = `${Math.floor(stats.sessionDuration / 60)}m ${Math.round(stats.sessionDuration % 60)}s`;
	return (
		<main
			className="analytics-dashboard"
			data-testid="analytics-dashboard"
			aria-busy={isFetching}
		>
			<header className="analytics-header">
				<div>
					<h1>Analytics</h1>
					<p>Understand how people use your site.</p>
				</div>
				<div className="analytics-live" aria-live="polite">
					{realtime.isError ? (
						"Live count unavailable"
					) : realtime.data ? (
						<>
							<strong>{number.format(realtime.data.visitors)}</strong> active in
							the last 5 minutes
						</>
					) : (
						"Loading live count…"
					)}
				</div>
			</header>
			<div className="analytics-toolbar">
				<div className="analytics-ranges" role="group" aria-label="Date range">
					{presets.map((preset) => (
						<button
							type="button"
							key={preset.value}
							aria-pressed={!custom && params.range === preset.value}
							onClick={() => {
								setCustom(false);
								setRangeError("");
								setParams({ range: preset.value });
							}}
						>
							{preset.label}
						</button>
					))}
					<button
						type="button"
						aria-pressed={custom}
						onClick={() => setCustom(true)}
					>
						Custom
					</button>
				</div>
				<PermissionAccess
					permission={analyticsPermissions.dashboard.export({})}
				>
					<button
						type="button"
						disabled={exporting}
						onClick={() => {
							void exportCSV();
						}}
					>
						{exporting ? "Exporting…" : "Export CSV"}
					</button>
				</PermissionAccess>
			</div>
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
			<dl className="analytics-metrics">
				<div>
					<dt>Unique visitors</dt>
					<dd>{number.format(stats.uniqueVisitors)}</dd>
				</div>
				<div>
					<dt>Page views</dt>
					<dd>{number.format(stats.pageViews)}</dd>
				</div>
				<div>
					<dt>Bounce rate</dt>
					<dd>{stats.bounceRate.toFixed(1)}%</dd>
				</div>
				<div>
					<dt>Session duration</dt>
					<dd>{duration}</dd>
				</div>
			</dl>
			{stats.pageViews === 0 && (
				<div className="analytics-empty" role="status">
					<h2>No page views in this range</h2>
					<p>
						Visit a tracked page or choose another date range. Custom events
						appear below.
					</p>
				</div>
			)}
			<TrafficChart page="analyticsDashboard" series={stats.series} />
			<PermissionAccess permission={analyticsPermissions.dashboard.read({})}>
				<FunnelReport key={JSON.stringify(params)} range={params} />
			</PermissionAccess>
			<section
				className="analytics-table-section"
				aria-labelledby="analytics-pages-title"
			>
				<div className="analytics-section-heading">
					<h2 id="analytics-pages-title">Top pages</h2>
					<span>Most viewed paths</span>
				</div>
				<div className="analytics-table-scroll">
					<table>
						<thead>
							<tr>
								<th scope="col">Page</th>
								<th scope="col">Visitors</th>
								<th scope="col">Page views</th>
								<th scope="col">Trend</th>
							</tr>
						</thead>
						<tbody>
							{stats.topPages.length ? (
								stats.topPages.map((page) => (
									<tr key={page.path}>
										<th scope="row" className="analytics-path">
											{page.path}
										</th>
										<td>{number.format(page.visitors)}</td>
										<td>{number.format(page.views)}</td>
										<td>
											<Sparkline values={page.trend} />
											<span className="analytics-sr-only">
												{page.trend.join(", ")} page views by day
											</span>
										</td>
									</tr>
								))
							) : (
								<tr>
									<td colSpan={4}>No page traffic in this range.</td>
								</tr>
							)}
						</tbody>
					</table>
				</div>
			</section>
			<div className="analytics-bottom-tables">
				<section
					className="analytics-table-section"
					aria-labelledby="analytics-referrers-title"
				>
					<div className="analytics-section-heading">
						<h2 id="analytics-referrers-title">Top referrers</h2>
						<span>Where visitors came from</span>
					</div>
					<div className="analytics-table-scroll">
						<table>
							<thead>
								<tr>
									<th scope="col">Source</th>
									<th scope="col">Page views</th>
								</tr>
							</thead>
							<tbody>
								{stats.topReferrers.length ? (
									stats.topReferrers.map((referrer) => (
										<tr key={referrer.referrer}>
											<th scope="row" className="analytics-path">
												{referrer.referrer || "Direct"}
											</th>
											<td>{number.format(referrer.views)}</td>
										</tr>
									))
								) : (
									<tr>
										<td colSpan={2}>No referrers in this range.</td>
									</tr>
								)}
							</tbody>
						</table>
					</div>
				</section>
				<section
					className="analytics-table-section"
					aria-labelledby="analytics-events-title"
				>
					<div className="analytics-section-heading">
						<h2 id="analytics-events-title">Top custom events</h2>
						<span>Actions visitors took</span>
					</div>
					<div className="analytics-table-scroll">
						<table>
							<thead>
								<tr>
									<th scope="col">Event</th>
									<th scope="col">Count</th>
								</tr>
							</thead>
							<tbody>
								{stats.topEvents.length ? (
									stats.topEvents.map((event) => (
										<tr key={event.name}>
											<th scope="row" className="analytics-path">
												{event.name}
											</th>
											<td>{number.format(event.count)}</td>
										</tr>
									))
								) : (
									<tr>
										<td colSpan={2}>No custom events in this range.</td>
									</tr>
								)}
							</tbody>
						</table>
					</div>
				</section>
			</div>
			{experiments.map((experimentKey) => (
				<PermissionAccess
					key={experimentKey}
					permission={analyticsPermissions.experiments.read({ experimentKey })}
				>
					<ExperimentReport experimentKey={experimentKey} params={params} />
				</PermissionAccess>
			))}
			<p className="analytics-note">
				Anonymous sessions are held in memory. No analytics cookies are created.
				Single-page sessions have a recorded duration of zero.
			</p>
		</main>
	);
}
