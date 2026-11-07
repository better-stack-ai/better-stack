"use client";

import { useState, type FormEvent } from "react";
import { PermissionAccess, useStack } from "@btst/stack/context";
import { analyticsPermissions } from "../../permissions";
import type {
	AnalyticsFunnelParams,
	AnalyticsFunnelStep,
	AnalyticsRangeParams,
} from "../../types";
import { ANALYTICS_PLUGIN_ID } from "../constants";
import { useFunnelReport } from "../hooks";

const number = new Intl.NumberFormat("en");

export function FunnelReport({ range }: { range: AnalyticsRangeParams }) {
	const [steps, setSteps] = useState<AnalyticsFunnelStep[]>([
		{ type: "pageview", path: "/", match: "exact" },
		{ type: "event", name: "purchase" },
	]);
	const [windowMinutes, setWindowMinutes] = useState("30");
	const [request, setRequest] = useState<AnalyticsFunnelParams | null>(null);
	const [exporting, setExporting] = useState(false);
	const [exportError, setExportError] = useState("");
	const report = useFunnelReport(request);
	const { plugins } = useStack();
	const api = plugins?.[ANALYTICS_PLUGIN_ID]?.api;

	function updateSteps(next: AnalyticsFunnelStep[]) {
		setSteps(next);
		setRequest(null);
		setExportError("");
	}

	function run(event: FormEvent) {
		event.preventDefault();
		const next = { ...range, steps, windowMinutes: Number(windowMinutes) };
		setExportError("");
		if (JSON.stringify(next) === JSON.stringify(request)) void report.refetch();
		else setRequest(next);
	}

	async function exportCSV() {
		if (!request) return;
		setExporting(true);
		setExportError("");
		try {
			const headers = new Headers(api?.browserHeaders);
			headers.set("content-type", "application/json");
			const response = await fetch(
				`${api?.baseURL ?? ""}${(api?.basePath ?? "/api/data").replace(/\/$/, "")}/analytics/funnel/export`,
				{
					method: "POST",
					headers,
					credentials: api?.credentials ?? "same-origin",
					body: JSON.stringify(request),
				},
			);
			if (!response.ok) throw new Error("Export failed");
			const url = URL.createObjectURL(await response.blob());
			const link = document.createElement("a");
			link.href = url;
			link.download = "analytics-funnel.csv";
			link.click();
			setTimeout(() => URL.revokeObjectURL(url), 1000);
		} catch {
			setExportError(
				"Funnel could not be exported. Check your export access and try again.",
			);
		} finally {
			setExporting(false);
		}
	}

	return (
		<section
			className="analytics-table-section analytics-funnel"
			aria-labelledby="analytics-funnel-title"
		>
			<div className="analytics-section-heading">
				<h2 id="analytics-funnel-title">Conversion funnel</h2>
				<span>Ordered steps · selected UTC date range</span>
			</div>
			<p className="analytics-note">
				Count each anonymous session once. Steps must happen in order within one
				UTC day. Choose up to 31 days.
			</p>
			<form onSubmit={run} className="analytics-funnel-form">
				{steps.map((step, index) => (
					<fieldset key={index} className="analytics-funnel-step">
						<legend>Step {index + 1}</legend>
						<label>
							Type
							<select
								value={step.type}
								onChange={(event) =>
									updateSteps(
										steps.map((current, position) =>
											position === index
												? event.target.value === "pageview"
													? { type: "pageview", path: "/", match: "exact" }
													: { type: "event", name: "" }
												: current,
										),
									)
								}
							>
								<option value="pageview">Page view</option>
								<option value="event">Custom event</option>
							</select>
						</label>
						{step.type === "pageview" ? (
							<>
								<label>
									Path
									<input
										value={step.path}
										required
										maxLength={2048}
										pattern="/.*"
										onChange={(event) =>
											updateSteps(
												steps.map((current, position) =>
													position === index
														? { ...step, path: event.target.value }
														: current,
												),
											)
										}
									/>
								</label>
								<label>
									Match
									<select
										value={step.match}
										onChange={(event) =>
											updateSteps(
												steps.map((current, position) =>
													position === index
														? {
																...step,
																match: event.target.value as "exact" | "prefix",
															}
														: current,
												),
											)
										}
									>
										<option value="exact">Exact path</option>
										<option value="prefix">Path prefix</option>
									</select>
								</label>
							</>
						) : (
							<label>
								Event name
								<input
									value={step.name}
									required
									maxLength={100}
									onChange={(event) =>
										updateSteps(
											steps.map((current, position) =>
												position === index
													? { ...step, name: event.target.value }
													: current,
											),
										)
									}
								/>
							</label>
						)}
						<button
							type="button"
							disabled={steps.length <= 2}
							aria-label={`Remove step ${index + 1}`}
							onClick={() =>
								updateSteps(steps.filter((_, position) => position !== index))
							}
						>
							Remove
						</button>
					</fieldset>
				))}
				<div className="analytics-funnel-actions">
					<button
						type="button"
						disabled={steps.length >= 8}
						onClick={() => updateSteps([...steps, { type: "event", name: "" }])}
					>
						Add step
					</button>
					<label>
						Conversion window (minutes)
						<input
							type="number"
							required
							min={1}
							max={1440}
							step={1}
							value={windowMinutes}
							onChange={(event) => {
								setWindowMinutes(event.target.value);
								setRequest(null);
							}}
						/>
					</label>
					<button type="submit" disabled={report.isFetching}>
						{report.isFetching ? "Running funnel…" : "Run funnel"}
					</button>
					<PermissionAccess
						permission={analyticsPermissions.dashboard.export({})}
					>
						<button
							type="button"
							disabled={
								!request ||
								!report.data ||
								!!report.error ||
								report.isFetching ||
								exporting
							}
							onClick={() => {
								void exportCSV();
							}}
						>
							{exporting ? "Exporting funnel…" : "Export funnel CSV"}
						</button>
					</PermissionAccess>
				</div>
			</form>
			{report.error && (
				<p role="alert" className="analytics-error">
					{report.error.message}
				</p>
			)}
			{exportError && (
				<p role="alert" className="analytics-error">
					{exportError}
				</p>
			)}
			{report.data && !report.error && (
				<div aria-live="polite" aria-busy={report.isFetching}>
					<p>
						<strong>
							{number.format(report.data.convertedSessions)} of{" "}
							{number.format(report.data.totalSessions)}
						</strong>{" "}
						sessions completed all steps ·{" "}
						{report.data.conversionRate.toFixed(1)}% conversion
					</p>
					{report.data.totalSessions === 0 && (
						<p role="status">
							No sessions matched the first step in this range.
						</p>
					)}
					<div className="analytics-table-scroll">
						<table>
							<caption className="analytics-sr-only">
								Ordered funnel results. Conversion is the share of sessions
								entering step 1; drop-off is from the previous step.
							</caption>
							<thead>
								<tr>
									<th scope="col">Step</th>
									<th scope="col">Sessions</th>
									<th scope="col">Conversion</th>
									<th scope="col">Drop-off</th>
								</tr>
							</thead>
							<tbody>
								{report.data.steps.map((result, index) => (
									<tr key={index}>
										<th scope="row">
											{index + 1}.{" "}
											{result.step.type === "pageview"
												? `${result.step.path}${result.step.match === "prefix" ? " (prefix)" : ""}`
												: result.step.name}
										</th>
										<td>{number.format(result.sessions)}</td>
										<td>{result.conversionRate.toFixed(1)}%</td>
										<td>
											{index === 0
												? "—"
												: `${number.format(result.dropOff)} (${result.dropOffRate.toFixed(1)}%)`}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</div>
			)}
		</section>
	);
}
