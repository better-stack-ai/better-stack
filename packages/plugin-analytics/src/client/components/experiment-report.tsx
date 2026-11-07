"use client";

import { useId } from "react";
import type { AnalyticsRangeParams } from "../../types";
import { useExperimentReport } from "../hooks";

/** Protected experiment samples, grouped by persisted definition and variant. */
export function ExperimentReport({
	experimentKey,
	params,
}: {
	experimentKey: string;
	params: AnalyticsRangeParams;
}) {
	const titleId = useId();
	const { data, isPending, isFetching, isError, refetch } = useExperimentReport(
		{
			...params,
			experimentKey,
		},
	);
	return (
		<section
			className="analytics-table-section"
			aria-labelledby={titleId}
			aria-busy={isFetching}
		>
			<div className="analytics-section-heading">
				<h2 id={titleId}>Experiment: {experimentKey}</h2>
				<span>Descriptive conversion report</span>
			</div>
			{isError ? (
				<div role="alert">
					<p>
						Experiment report unavailable. Check your access and configuration.
					</p>
					<button type="button" onClick={() => void refetch()}>
						Try again
					</button>
				</div>
			) : isPending ? (
				<p role="status">Loading experiment samples…</p>
			) : data ? (
				<>
					<p className="analytics-note">
						Flag: {data.flagKey}. Attribution stays within one anonymous session
						and UTC day. Only conversions after exposure and within the listed
						window count. Each subject converts at most once per definition.
					</p>
					<div className="analytics-table-scroll">
						<table aria-label={`Variant conversions for ${experimentKey}`}>
							<thead>
								<tr>
									<th scope="col">Variant</th>
									<th scope="col">Definition</th>
									<th scope="col">Conversion event</th>
									<th scope="col">Subjects</th>
									<th scope="col">Exposures</th>
									<th scope="col">Conversions</th>
									<th scope="col">Rate</th>
									<th scope="col">Window</th>
								</tr>
							</thead>
							<tbody>
								{data.rows.length ? (
									data.rows.map((row) => (
										<tr key={`${row.configurationVersion}:${row.variant}`}>
											<th scope="row" className="analytics-path">
												{row.variant}
											</th>
											<td>
												<code title={row.configurationVersion}>
													{row.configurationVersion.slice(0, 12)}
												</code>
											</td>
											<td className="analytics-path">{row.conversionEvent}</td>
											<td>{row.subjects}</td>
											<td>{row.exposures}</td>
											<td>{row.conversions}</td>
											<td>{row.conversionRate.toFixed(1)}%</td>
											<td>{row.attributionWindowMs / 60000} min</td>
										</tr>
									))
								) : (
									<tr>
										<td colSpan={8}>No experiment exposures in this range.</td>
									</tr>
								)}
							</tbody>
						</table>
					</div>
					<p className="analytics-note">
						Definition changes stay separate. These observations do not
						establish statistical significance or verify purchases.
					</p>
				</>
			) : null}
		</section>
	);
}
