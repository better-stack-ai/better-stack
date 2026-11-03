"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import { PermissionAccess, usePluginSiteNavigation } from "@btst/stack/context";
import { featureFlagsPermissions } from "../../../permissions";
import type { FlagContext } from "../../../types";
import { useFlag, useFlagEvaluations } from "../../hooks";
import { FEATURE_FLAGS_PLUGIN_ID } from "../../constants";
import { Field, FlagsPage } from "../shared";

export function FlagDetailPage({ flagKey }: { flagKey: string }) {
	const { Link, resolve } = usePluginSiteNavigation(FEATURE_FLAGS_PLUGIN_ID);
	const {
		data: evaluations,
		refetch,
		isFetching,
	} = useFlagEvaluations(flagKey);
	return (
		<FlagsPage
			title="Evaluation log"
			description={flagKey}
			action={<Link href={resolve("feature-flags").href}>All flags</Link>}
		>
			<PermissionAccess
				permission={featureFlagsPermissions.evaluations.evaluate({
					scope: "single",
					key: flagKey,
				})}
			>
				<EvaluationPreview flagKey={flagKey} onEvaluated={refetch} />
			</PermissionAccess>
			<div className="ff-section-heading">
				<div>
					<h2>Recent evaluations</h2>
					<p className="ff-note">
						Recent results are kept in memory and reset when the server
						restarts.
					</p>
				</div>
				<button
					type="button"
					disabled={isFetching}
					onClick={() => void refetch()}
				>
					Refresh log
				</button>
			</div>
			{evaluations.length ? (
				<div className="ff-table-scroll">
					<table>
						<caption className="ff-sr-only">
							Recent evaluations for {flagKey}
						</caption>
						<thead>
							<tr>
								<th scope="col">Time</th>
								<th scope="col">Result</th>
								<th scope="col">Context</th>
							</tr>
						</thead>
						<tbody>
							{evaluations.map((evaluation) => (
								<tr key={evaluation.id}>
									<td>
										<time dateTime={evaluation.timestamp}>
											{new Date(evaluation.timestamp).toLocaleString()}
										</time>
									</td>
									<td>
										<span
											className={evaluation.result ? "ff-success" : "ff-muted"}
										>
											{String(evaluation.result)}
										</span>
									</td>
									<td>
										<code className="ff-context">
											{JSON.stringify(evaluation.context)}
										</code>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			) : (
				<div className="ff-empty">
					<h2>No evaluations yet</h2>
					<p>Evaluate this flag with a context above, or use it in your app.</p>
				</div>
			)}
		</FlagsPage>
	);
}

function EvaluationPreview({
	flagKey,
	onEvaluated,
}: {
	flagKey: string;
	onEvaluated: () => unknown;
}) {
	const id = useId();
	const [context, setContext] = useState<FlagContext>();
	const [take, setTake] = useState(0);
	const submit = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		const data = new FormData(event.currentTarget);
		const value = (key: string) => String(data.get(key) ?? "").trim();
		setContext({
			...(value("userId") ? { userId: value("userId") } : {}),
			...(value("sessionId") ? { sessionId: value("sessionId") } : {}),
			...(value("email") ? { email: value("email") } : {}),
			...(value("tags")
				? {
						tags: value("tags")
							.split(",")
							.map((tag) => tag.trim())
							.filter(Boolean),
					}
				: {}),
		});
		setTake((current) => current + 1);
	};
	return (
		<section className="ff-preview">
			<h2>Try a context</h2>
			<p className="ff-note">
				Check the live result for a user or session. This also adds an
				evaluation to the log.
			</p>
			<form onSubmit={submit}>
				<div className="ff-preview-fields">
					<Field id={`${id}-user`} label="User ID">
						<input id={`${id}-user`} name="userId" maxLength={256} />
					</Field>
					<Field id={`${id}-session`} label="Session ID">
						<input id={`${id}-session`} name="sessionId" maxLength={256} />
					</Field>
					<Field id={`${id}-email`} label="Email">
						<input
							id={`${id}-email`}
							name="email"
							type="email"
							maxLength={320}
						/>
					</Field>
					<Field id={`${id}-tags`} label="Context tags">
						<input id={`${id}-tags`} name="tags" placeholder="beta, staff" />
					</Field>
				</div>
				<div className="ff-actions">
					<button type="submit">Evaluate flag</button>
					{context && (
						<PreviewResult
							key={take}
							flagKey={flagKey}
							context={context}
							onEvaluated={onEvaluated}
						/>
					)}
				</div>
			</form>
		</section>
	);
}

function PreviewResult({
	flagKey,
	context,
	onEvaluated,
}: {
	flagKey: string;
	context: FlagContext;
	onEvaluated: () => unknown;
}) {
	const { data, isFetching, error, refetch, dataUpdatedAt } = useFlag(
		flagKey,
		context,
	);
	useEffect(() => {
		void refetch();
	}, [refetch]);
	useEffect(() => {
		if (dataUpdatedAt) onEvaluated();
	}, [dataUpdatedAt, onEvaluated]);
	return error ? (
		<p role="alert" className="ff-error">
			{error.message}
		</p>
	) : (
		<output aria-live="polite">
			{isFetching || data === undefined ? "Evaluating…" : `Result: ${data}`}
		</output>
	);
}
