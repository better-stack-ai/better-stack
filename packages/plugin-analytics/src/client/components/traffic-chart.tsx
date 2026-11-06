"use client";

import { usePluginOverrides } from "@btst/stack/context";
import { ANALYTICS_PLUGIN_ID } from "../constants";
import type {
	AnalyticsPluginOverrides,
	AnalyticsTrafficChartProps,
} from "../overrides";

const number = new Intl.NumberFormat("en");
const dateLabel = (date: string) =>
	new Intl.DateTimeFormat("en", {
		month: "short",
		day: "numeric",
		timeZone: "UTC",
	}).format(new Date(date));

export function TrafficChart({
	page,
	...props
}: AnalyticsTrafficChartProps & { page?: "analyticsDashboard" }) {
	return page ? (
		<ScopedTrafficChart page={page} {...props} />
	) : (
		<DefaultTrafficChart {...props} />
	);
}

function ScopedTrafficChart({
	page,
	...props
}: AnalyticsTrafficChartProps & { page: "analyticsDashboard" }) {
	const { pageOverrides } =
		usePluginOverrides<AnalyticsPluginOverrides>(ANALYTICS_PLUGIN_ID);
	const Component =
		(page ? pageOverrides?.[page]?.TrafficChart : undefined) ??
		DefaultTrafficChart;
	return <Component {...props} />;
}

function DefaultTrafficChart({ series }: AnalyticsTrafficChartProps) {
	const max = Math.max(1, ...series.map((point) => point.pageViews));
	const points = series.map(
		(point, index) =>
			`${(index * 960) / Math.max(1, series.length - 1)},${180 - (point.pageViews / max) * 160}`,
	);
	return (
		<section
			className="analytics-traffic"
			aria-labelledby="analytics-traffic-title"
		>
			<div className="analytics-section-heading">
				<h2 id="analytics-traffic-title">Traffic over time</h2>
				<span>Page views per day · UTC</span>
			</div>
			<svg
				className="analytics-chart"
				viewBox="-5 0 970 200"
				role="img"
				aria-label={`Daily page views from ${series[0]?.date ?? "start"} to ${series.at(-1)?.date ?? "end"}. Peak ${max} page views.`}
			>
				<line
					x1="0"
					x2="960"
					y1="180"
					y2="180"
					className="analytics-chart-rule"
				/>
				{points.length > 0 && (
					<>
						<polygon
							points={`0,180 ${points.join(" ")} ${points.length > 1 ? "960" : "0"},180`}
							className="analytics-chart-area"
						/>
						<polyline
							points={points.join(" ")}
							fill="none"
							stroke="currentColor"
							strokeWidth="3"
							vectorEffect="non-scaling-stroke"
						/>
						{series.length === 1 && (
							<circle
								cx="0"
								cy={180 - (series[0]!.pageViews / max) * 160}
								r="4"
								fill="currentColor"
							/>
						)}
					</>
				)}
			</svg>
			<div className="analytics-chart-labels">
				<span>{series[0] ? dateLabel(series[0].date) : ""}</span>
				<span>{series.at(-1) ? dateLabel(series.at(-1)!.date) : ""}</span>
			</div>
			<details className="analytics-chart-data">
				<summary>View daily counts</summary>
				<div className="analytics-table-scroll">
					<table>
						<thead>
							<tr>
								<th scope="col">Date (UTC)</th>
								<th scope="col">Page views</th>
								<th scope="col">Visitors</th>
							</tr>
						</thead>
						<tbody>
							{series.map((point) => (
								<tr key={point.date}>
									<th scope="row">{point.date}</th>
									<td>{number.format(point.pageViews)}</td>
									<td>{number.format(point.visitors)}</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			</details>
		</section>
	);
}
