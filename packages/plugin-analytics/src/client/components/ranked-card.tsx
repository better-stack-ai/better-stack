"use client";

import { useId, useState } from "react";
import type { AnalyticsDimensionRow } from "../../types";

export function RankedCard({
	title,
	tabs,
	percentageOf,
}: {
	title: string;
	tabs: { label: string; rows: AnalyticsDimensionRow[] }[];
	percentageOf?: number;
}) {
	const id = useId();
	const [selected, setSelected] = useState(0);
	const [expanded, setExpanded] = useState(false);
	const tab = tabs[selected] ?? tabs[0]!;
	const rows = expanded ? tab.rows : tab.rows.slice(0, 5);
	const max = Math.max(1, ...tab.rows.map((row) => row.visitors));
	return (
		<section className="analytics-card" aria-label={title}>
			<div className="analytics-card-heading">
				<div
					role="group"
					aria-label={`${title} breakdown`}
					className="analytics-card-tabs"
				>
					{tabs.map((item, index) => (
						<button
							type="button"
							key={item.label}
							aria-pressed={index === selected}
							aria-controls={id}
							onClick={() => {
								setSelected(index);
								setExpanded(false);
							}}
						>
							{item.label}
						</button>
					))}
				</div>
				<span title="Distinct daily anonymous sessions">Visitors</span>
			</div>
			<div id={id} className="analytics-rank-list" aria-live="polite">
				{rows.length ? (
					rows.map((row) => (
						<div
							key={row.value}
							className="analytics-rank-row"
							title={`${row.value}: ${row.visitors} visitors, ${row.views} page views`}
						>
							<span
								className="analytics-rank-bar"
								aria-hidden="true"
								style={{ width: `${(row.visitors / max) * 100}%` }}
							/>
							<span className="analytics-rank-name">{row.value}</span>
							{row.trend && (
								<>
									<svg
										className="analytics-sparkline"
										viewBox="0 0 80 24"
										role="img"
										aria-label={`${row.value}: ${row.trend.join(", ")} page views by day`}
									>
										<polyline
											fill="none"
											stroke="currentColor"
											strokeWidth="1.5"
											points={row.trend
												.map(
													(value, index) =>
														`${(index * 78) / Math.max(1, row.trend!.length - 1) + 1},${22 - (value / Math.max(1, ...row.trend!)) * 20}`,
												)
												.join(" ")}
										/>
									</svg>
								</>
							)}
							<strong>
								{percentageOf
									? `${Math.round((row.visitors / percentageOf) * 100)}%`
									: row.visitors.toLocaleString("en")}
							</strong>
						</div>
					))
				) : (
					<p className="analytics-card-empty">No data in this range.</p>
				)}
			</div>
			{tab.rows.length > 5 && (
				<button
					type="button"
					className="analytics-show-more"
					aria-expanded={expanded}
					onClick={() => setExpanded(!expanded)}
				>
					{expanded ? "Show less" : `Show all ${tab.rows.length}`}
				</button>
			)}
		</section>
	);
}
