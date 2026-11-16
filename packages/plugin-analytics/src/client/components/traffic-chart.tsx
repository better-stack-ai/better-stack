"use client";

import { useState, useRef, useEffect } from "react";
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

function DefaultTrafficChart({
	series,
	metric = "pageViews",
}: AnalyticsTrafficChartProps) {
	const [active, setActive] = useState<number | null>(null);
	const svg = useRef<SVGSVGElement>(null);
	const [width, setWidth] = useState(960);
	useEffect(() => {
		if (typeof ResizeObserver === "undefined") return;
		const observer = new ResizeObserver(([entry]) => {
			if (entry) setWidth(Math.max(300, entry.contentRect.width));
		});
		observer.observe(svg.current!);
		return () => observer.disconnect();
	}, []);
	const label = {
		uniqueVisitors: "Visitors",
		pageViews: "Page views",
		bounceRate: "Bounce rate",
		sessionDuration: "Session duration",
	}[metric];
	const values = series.map((point) =>
		metric === "uniqueVisitors" ? point.visitors : (point[metric] ?? 0),
	);
	const max =
		metric === "bounceRate"
			? 100
			: Math.max(3, Math.ceil(Math.max(0, ...values) / 3) * 3);
	const x = (index: number) =>
		45 + (index * (width - 70)) / Math.max(1, series.length - 1);
	const y = (value: number) => 205 - (value / max) * 170;
	const points = values.map((value, index) => `${x(index)},${y(value)}`);
	const today = new Date().toISOString().slice(0, 10);
	const partial = series.at(-1)?.date === today;
	const format = (value: number) =>
		metric === "bounceRate"
			? `${value.toFixed(1)}%`
			: metric === "sessionDuration"
				? `${Math.round(value)}s`
				: number.format(value);
	const focused = active === null ? undefined : series[active];
	return (
		<section className="analytics-traffic" aria-label="Traffic over time">
			<div className="analytics-section-heading">
				<h2>Traffic over time</h2>
				<span>{label} per day · UTC</span>
			</div>
			<div className="analytics-chart-tooltip" aria-live="polite">
				{focused
					? `${dateLabel(focused.date)}: ${format(values[active!]!)} ${label.toLowerCase()}${focused.date === today ? " (day in progress)" : ""}`
					: "Hover or focus a day for details"}
			</div>
			<svg
				className="analytics-chart"
				ref={svg}
				viewBox={`0 0 ${width} 245`}
				role="group"
				aria-label={`Daily ${label.toLowerCase()} from ${series[0]?.date ?? "start"} to ${series.at(-1)?.date ?? "end"}. Peak ${format(Math.max(0, ...values))}.`}
			>
				{[0, 1, 2, 3].map((index) => {
					const value = (max * index) / 3;
					return (
						<g key={index}>
							<line
								x1="45"
								x2={width - 25}
								y1={y(value)}
								y2={y(value)}
								className="analytics-chart-rule"
							/>
							<text
								x="33"
								y={y(value) + 4}
								textAnchor="end"
								className="analytics-chart-axis"
							>
								{metric === "bounceRate"
									? `${Math.round(value)}%`
									: Math.round(value)}
							</text>
						</g>
					);
				})}
				{points.length > 0 && (
					<>
						<polygon
							points={`45,205 ${points.join(" ")} ${x(points.length - 1)},205`}
							className="analytics-chart-area"
						/>
						<polyline
							points={(partial && points.length > 1
								? points.slice(0, -1)
								: points
							).join(" ")}
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							vectorEffect="non-scaling-stroke"
						/>
						{partial && points.length > 1 && (
							<polyline
								points={points.slice(-2).join(" ")}
								fill="none"
								stroke="currentColor"
								strokeWidth="2"
								strokeDasharray="5 5"
								vectorEffect="non-scaling-stroke"
							/>
						)}
					</>
				)}
				{series.map((point, index) => (
					<g key={point.date}>
						{(index === 0 ||
							index === series.length - 1 ||
							index %
								Math.ceil(
									(series.length - 1) / Math.max(1, Math.floor(width / 100)),
								) ===
								0) && (
							<text
								x={x(index)}
								y="233"
								textAnchor="middle"
								className="analytics-chart-axis"
							>
								{dateLabel(point.date)}
							</text>
						)}
						<circle
							cx={x(index)}
							cy={y(values[index]!)}
							r={active === index || series.length === 1 ? 4 : 2}
							fill="currentColor"
						/>
						<circle
							cx={x(index)}
							cy={y(values[index]!)}
							r="12"
							fill="transparent"
							tabIndex={0}
							role="img"
							aria-label={`${dateLabel(point.date)}: ${format(values[index]!)} ${label.toLowerCase()}${point.date === today ? ", day in progress" : ""}`}
							onMouseEnter={() => setActive(index)}
							onMouseLeave={() => setActive(null)}
							onFocus={() => setActive(index)}
							onBlur={() => setActive(null)}
						>
							<title>{`${dateLabel(point.date)}: ${format(values[index]!)}`}</title>
						</circle>
					</g>
				))}
			</svg>
			<details className="analytics-chart-data">
				<summary>View daily counts</summary>
				<div className="analytics-table-scroll">
					<table>
						<thead>
							<tr>
								<th scope="col">Date (UTC)</th>
								<th scope="col">Page views</th>
								<th scope="col">Visitors</th>
								<th scope="col">Bounce rate</th>
							</tr>
						</thead>
						<tbody>
							{series.map((point) => (
								<tr key={point.date}>
									<th scope="row">{point.date}</th>
									<td>{number.format(point.pageViews)}</td>
									<td>{number.format(point.visitors)}</td>
									<td>
										{point.bounceRate === undefined
											? "—"
											: `${point.bounceRate.toFixed(1)}%`}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			</details>
		</section>
	);
}
